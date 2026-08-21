import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  mercadoPagoConfig,
  mercadoPagoOrderView,
  mercadoPagoPublicError,
  mercadoPagoRequest,
  reconcileMercadoPagoOrder,
  type MercadoPagoOrderView,
} from "../_shared/mercado-pago.ts";
import { createAdminClient, requireAuthenticatedUser } from "../_shared/supabase.ts";

class PaymentError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validClientKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function paymentKey(userId: string, orderId: string, clientKey: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${orderId}:${clientKey}`),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `mp-${hex.slice(0, 60)}`;
}

function mockStatusResponse(stored: Record<string, unknown>, requestedStatus: string): Record<string, unknown> {
  const response = structuredClone(stored);
  const transactions = object(response.transactions);
  const paymentRows = Array.isArray(transactions.payments) ? transactions.payments as Record<string, unknown>[] : [];
  const payment = object(paymentRows[0]);
  const status = requestedStatus === "approved" ? "processed" : requestedStatus === "rejected" ? "failed" : "action_required";
  const detail = requestedStatus === "approved" ? "accredited" : requestedStatus === "rejected" ? "cc_rejected_other_reason" : "waiting_transfer";
  response.status = status;
  response.status_detail = detail;
  payment.status = status;
  payment.status_detail = detail;
  transactions.payments = [payment];
  response.transactions = transactions;
  return response;
}

async function loadOwnedOrder(admin: ReturnType<typeof createAdminClient>, orderId: string, userId: string) {
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, customer_id, status, total_amount_cents, inventory_expires_at, customer_snapshot")
    .eq("id", orderId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (error) throw new PaymentError("ORDER_RELOAD_FAILED", "Não foi possível carregar o pedido.", 500);
  if (!data) throw new PaymentError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  return data;
}

async function responseBody(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
  paymentAttemptId: string,
  outcome: string,
  payment: MercadoPagoOrderView,
) {
  const { data: order } = await admin.from("orders").select("status, order_number, inventory_expires_at").eq("id", orderId).single();
  return {
    outcome,
    orderStatus: order?.status ?? "payment_failed",
    orderNumber: order?.order_number ?? null,
    expiresAt: order?.inventory_expires_at ?? null,
    paymentAttemptId,
    payment,
  };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (!headers) return errorResponse("ORIGIN_NOT_ALLOWED", "Origem não autorizada.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Método não permitido.", 405, headers);

  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return errorResponse("UNAUTHORIZED", "Entre na sua conta para pagar.", 401, headers);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }

  const admin = createAdminClient();
  try {
    const action = text(body.action) || "create";
    const orderId = body.orderId;
    if (!validUuid(orderId)) throw new PaymentError("INVALID_ORDER", "Pedido inválido.");
    const order = await loadOwnedOrder(admin, orderId, user.id);

    if (action === "status") {
      const paymentAttemptId = body.paymentAttemptId;
      if (!validUuid(paymentAttemptId)) throw new PaymentError("INVALID_PAYMENT_ATTEMPT", "Tentativa de pagamento inválida.");
      const { data: attempt, error } = await admin
        .from("payment_attempts")
        .select("id, order_id, provider_order_id, provider_response")
        .eq("id", paymentAttemptId)
        .eq("order_id", orderId)
        .maybeSingle();
      if (error || !attempt) throw new PaymentError("PAYMENT_NOT_FOUND", "Pagamento não encontrado.", 404);
      if (!attempt.provider_order_id) throw new PaymentError("PAYMENT_NOT_READY", "O pagamento ainda não foi criado.", 409);

      let providerOrder: Record<string, unknown>;
      if (mercadoPagoConfig().mock) {
        const mockStatus = ["approved", "rejected", "pending"].includes(text(body.mockStatus)) ? text(body.mockStatus) : "pending";
        providerOrder = mockStatusResponse(object(attempt.provider_response), mockStatus);
      } else {
        providerOrder = await mercadoPagoRequest<Record<string, unknown>>(
          `/v1/orders/${encodeURIComponent(attempt.provider_order_id)}`,
          { method: "GET" },
        );
      }
      const result = await reconcileMercadoPagoOrder(admin, orderId, paymentAttemptId, providerOrder);
      return jsonResponse(await responseBody(admin, orderId, paymentAttemptId, result.outcome, result.payment), 200, headers);
    }

    if (action !== "create") throw new PaymentError("INVALID_ACTION", "Ação de pagamento inválida.");
    if (!validClientKey(body.idempotencyKey)) throw new PaymentError("INVALID_IDEMPOTENCY_KEY", "Identificador da tentativa inválido.");
    if (!["awaiting_payment", "payment_failed"].includes(order.status)) {
      if (order.status === "paid") {
        throw new PaymentError("ORDER_ALREADY_PAID", "Este pedido já está pago.", 409);
      }
      throw new PaymentError("ORDER_NOT_PAYABLE", "Este pedido não pode mais ser pago.", 409);
    }
    if (!order.inventory_expires_at || new Date(order.inventory_expires_at).getTime() <= Date.now()) {
      await admin.rpc("expire_inventory_reservations");
      throw new PaymentError("CHECKOUT_EXPIRED", "A reserva expirou. Refaça o checkout.", 409);
    }

    const { count: recentAttemptCount, error: rateLimitError } = await admin
      .from("payment_attempts")
      .select("id, orders!inner(customer_id)", { count: "exact", head: true })
      .eq("orders.customer_id", user.id)
      .gt("created_at", new Date(Date.now() - 60 * 1000).toISOString());
    if (rateLimitError) throw new PaymentError("PAYMENT_RATE_LIMIT_FAILED", "Não foi possível validar a tentativa.", 500);
    if ((recentAttemptCount ?? 0) >= 8) {
      throw new PaymentError("TOO_MANY_PAYMENT_ATTEMPTS", "Aguarde um minuto antes de tentar pagar novamente.", 429);
    }

    const method = text(body.method);
    if (method !== "pix" && method !== "card") throw new PaymentError("INVALID_PAYMENT_METHOD", "Escolha Pix ou cartão.");
    const idempotencyKey = await paymentKey(user.id, orderId, String(body.idempotencyKey));
    const { data: inserted, error: insertError } = await admin.from("payment_attempts").insert({
      order_id: orderId,
      idempotency_key: idempotencyKey,
      payment_method: method,
      status: "created",
      amount_cents: Number(order.total_amount_cents),
      expires_at: order.inventory_expires_at,
    }).select("id, provider_order_id, provider_response").maybeSingle();

    let attempt = inserted;
    if (insertError) {
      if (insertError.code !== "23505") throw new PaymentError("PAYMENT_STORAGE_FAILED", "Não foi possível iniciar o pagamento.", 500);
      const { data: existing, error } = await admin
        .from("payment_attempts")
        .select("id, provider_order_id, provider_response")
        .eq("idempotency_key", idempotencyKey)
        .eq("order_id", orderId)
        .maybeSingle();
      if (error || !existing) throw new PaymentError("PAYMENT_STORAGE_FAILED", "Não foi possível recuperar o pagamento.", 500);
      attempt = existing;
    }
    if (!attempt) throw new PaymentError("PAYMENT_STORAGE_FAILED", "Não foi possível iniciar o pagamento.", 500);

    if (attempt.provider_order_id && Object.keys(object(attempt.provider_response)).length) {
      const stored = object(attempt.provider_response);
      return jsonResponse(
        await responseBody(admin, orderId, attempt.id, mercadoPagoOrderView(stored).status, mercadoPagoOrderView(stored)),
        200,
        headers,
      );
    }

    const amount = (Number(order.total_amount_cents) / 100).toFixed(2);
    const customer = object(order.customer_snapshot);
    const mercadoPago = mercadoPagoConfig();
    const testPixFixture = method === "pix" && mercadoPago.environment === "test";
    const providerAmount = testPixFixture ? "50.00" : amount;
    const payer = testPixFixture
      ? { email: "test_user_br@testuser.com", first_name: "APRO" }
      : { email: text(customer.email) };
    let paymentMethod: Record<string, unknown>;
    let expiration: Record<string, unknown> = {};
    if (method === "pix") {
      paymentMethod = { id: "pix", type: "bank_transfer" };
      // A fixture de homologacao deve seguir exatamente o formato documentado.
      expiration = testPixFixture ? {} : { expiration_time: "PT30M" };
    } else {
      const card = object(body.card);
      const token = text(card.token);
      const paymentMethodId = text(card.paymentMethodId);
      const paymentTypeId = text(card.paymentTypeId);
      const installments = Number(card.installments);
      if (
        token.length < 8 || token.length > 500
        || !/^[A-Za-z0-9_-]{2,40}$/.test(paymentMethodId)
        || !["credit_card", "debit_card", "prepaid_card"].includes(paymentTypeId)
        || !Number.isInteger(installments) || installments < 1 || installments > 12
      ) {
        throw new PaymentError("INVALID_CARD_TOKEN", "Os dados tokenizados do cartão são inválidos.");
      }
      paymentMethod = { id: paymentMethodId, type: paymentTypeId, token, installments };
    }

    let providerOrder: Record<string, unknown>;
    try {
      providerOrder = await mercadoPagoRequest<Record<string, unknown>>("/v1/orders", {
        method: "POST",
        idempotencyKey,
        body: {
          type: "online",
          processing_mode: "automatic",
          total_amount: providerAmount,
          external_reference: orderId,
          payer,
          transactions: { payments: [{ amount: providerAmount, payment_method: paymentMethod, ...expiration }] },
        },
      });
    } catch (error) {
      const providerError = mercadoPagoPublicError(error);
      await admin.from("payment_attempts").update({
        status: "error",
        status_detail: providerError.code.slice(0, 200),
      }).eq("id", attempt.id);
      throw error;
    }

    const result = await reconcileMercadoPagoOrder(admin, orderId, attempt.id, providerOrder);
    return jsonResponse(await responseBody(admin, orderId, attempt.id, result.outcome, result.payment), 200, headers);
  } catch (error) {
    if (error instanceof PaymentError) return errorResponse(error.code, error.message, error.status, headers);
    const publicError = mercadoPagoPublicError(error);
    return errorResponse(publicError.code, publicError.message, publicError.status, headers);
  }
});
