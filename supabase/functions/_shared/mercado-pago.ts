import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type MercadoPagoRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type MercadoPagoOrderView = {
  providerOrderId: string;
  providerPaymentId: string | null;
  status: string;
  statusDetail: string;
  paymentMethod: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  challengeUrl: string | null;
};

export class MercadoPagoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new MercadoPagoError("MERCADOPAGO_NOT_CONFIGURED", `Variável ${name} não configurada.`, 503);
  return value;
}

export function mercadoPagoConfig() {
  const mock = Deno.env.get("MERCADOPAGO_MOCK") === "true";
  const environment = Deno.env.get("MERCADOPAGO_ENV")?.trim().toLowerCase() || (mock ? "test" : "production");
  if (environment !== "test" && environment !== "production") {
    throw new MercadoPagoError(
      "MERCADOPAGO_NOT_CONFIGURED",
      "Variável MERCADOPAGO_ENV deve ser test ou production.",
      503,
    );
  }
  return {
    apiUrl: (Deno.env.get("MERCADOPAGO_API_URL")?.trim() || "https://api.mercadopago.com").replace(/\/$/, ""),
    accessToken: mock ? Deno.env.get("MERCADOPAGO_ACCESS_TOKEN")?.trim() || "TEST-mock-access-token" : requiredEnvironment("MERCADOPAGO_ACCESS_TOKEN"),
    publicKey: mock ? Deno.env.get("MERCADOPAGO_PUBLIC_KEY")?.trim() || "TEST-mock-public-key" : requiredEnvironment("MERCADOPAGO_PUBLIC_KEY"),
    webhookSecret: mock
      ? Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET")?.trim() || "test-webhook-secret"
      : requiredEnvironment("MERCADOPAGO_WEBHOOK_SECRET"),
    environment,
    mock,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function httpsUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

function payments(order: Record<string, unknown>): Record<string, unknown>[] {
  const rows = object(order.transactions).payments;
  return Array.isArray(rows) ? rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function firstPayment(order: Record<string, unknown>): Record<string, unknown> {
  return payments(order)[0] ?? {};
}

async function stableMockId(prefix: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const suffix = Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `${prefix}${suffix}`;
}

async function mockRequest(path: string, options: MercadoPagoRequestOptions): Promise<Record<string, unknown>> {
  if (path === "/v1/orders" && options.method === "POST") {
    const body = options.body ?? {};
    const payment = object((object(body.transactions).payments as unknown[] | undefined)?.[0]);
    const paymentMethod = object(payment.payment_method);
    const token = text(paymentMethod.token);
    const pix = text(paymentMethod.id) === "pix";
    const rejected = token.includes("rejected");
    const challenge = token.includes("challenge");
    const orderStatus = rejected ? "failed" : challenge || pix ? "action_required" : "processed";
    const statusDetail = rejected ? "cc_rejected_other_reason" : challenge ? "pending_challenge" : pix ? "waiting_transfer" : "accredited";
    const key = options.idempotencyKey || crypto.randomUUID();
    const orderId = await stableMockId("MOCKORD", key);
    const paymentId = await stableMockId("MOCKPAY", key);
    return {
      id: orderId,
      type: "online",
      processing_mode: "automatic",
      external_reference: body.external_reference,
      total_amount: body.total_amount,
      status: orderStatus,
      status_detail: statusDetail,
      transactions: {
        payments: [{
          id: paymentId,
          amount: payment.amount,
          status: orderStatus,
          status_detail: statusDetail,
          payment_method: {
            id: paymentMethod.id,
            type: paymentMethod.type,
            installments: paymentMethod.installments,
            qr_code: pix ? `00020126MOCK${key.replace(/[^A-Za-z0-9]/g, "").slice(0, 32)}` : undefined,
            qr_code_base64: "",
            ticket_url: pix ? "https://www.mercadopago.com.br/" : undefined,
            transaction_security: challenge ? { url: "https://www.mercadopago.com.br/" } : undefined,
          },
        }],
      },
    };
  }

  if (/^\/v1\/orders\/[^/]+\/refund$/.test(path) && options.method === "POST") {
    const providerOrderId = path.split("/")[3];
    return {
      id: providerOrderId,
      status: "refunded",
      status_detail: "refunded",
      transactions: {
        refunds: [{ id: await stableMockId("MOCKREF", options.idempotencyKey || providerOrderId), status: "processed" }],
      },
    };
  }

  throw new MercadoPagoError("MERCADOPAGO_MOCK_UNSUPPORTED", "Operação simulada não suportada.", 500);
}

export async function mercadoPagoRequest<T extends Record<string, unknown>>(
  path: string,
  options: MercadoPagoRequestOptions = {},
): Promise<T> {
  const config = mercadoPagoConfig();
  if (config.mock) return await mockRequest(path, options) as T;

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${config.accessToken}`,
    "Content-Type": "application/json",
  };
  if (options.idempotencyKey) headers["X-Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new MercadoPagoError("MERCADOPAGO_UNAVAILABLE", "O Mercado Pago está temporariamente indisponível.", 503);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Uma resposta sem JSON nunca é útil para o checkout.
  }
  if (!response.ok) {
    const provider = object(payload);
    const providerCode = text(provider.code) || text(provider.error) || `HTTP_${response.status}`;
    console.error(JSON.stringify({
      event: "mercadopago_request_failed",
      path,
      providerCode,
      providerStatus: response.status,
    }));
    throw new MercadoPagoError(
      providerCode,
      response.status >= 500
        ? "O Mercado Pago não conseguiu concluir a operação. Tente novamente."
        : "O pagamento não pôde ser processado. Confira os dados e tente novamente.",
      response.status >= 500 ? 503 : 422,
      { providerCode, providerStatus: response.status },
    );
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MercadoPagoError("INVALID_MERCADOPAGO_RESPONSE", "O Mercado Pago retornou uma resposta inválida.");
  }
  return payload as T;
}

export function sanitizeMercadoPagoOrder(order: Record<string, unknown>): Record<string, unknown> {
  const payment = firstPayment(order);
  const method = object(payment.payment_method);
  const security = object(method.transaction_security);
  return {
    id: text(order.id),
    status: text(order.status),
    status_detail: text(order.status_detail),
    external_reference: text(order.external_reference),
    total_amount: text(order.total_amount),
    transactions: {
      payments: [{
        id: text(payment.id),
        status: text(payment.status),
        status_detail: text(payment.status_detail),
        amount: text(payment.amount),
        payment_method: {
          id: text(method.id),
          type: text(method.type),
          installments: Number(method.installments) || null,
          qr_code: text(method.qr_code) || null,
          qr_code_base64: text(method.qr_code_base64) || null,
          ticket_url: httpsUrl(method.ticket_url),
          transaction_security: { url: httpsUrl(security.url) },
        },
      }],
    },
  };
}

export function mercadoPagoOrderView(order: Record<string, unknown>): MercadoPagoOrderView {
  const payment = firstPayment(order);
  const method = object(payment.payment_method);
  const security = object(method.transaction_security);
  return {
    providerOrderId: text(order.id),
    providerPaymentId: text(payment.id) || null,
    status: text(payment.status) || text(order.status),
    statusDetail: text(payment.status_detail) || text(order.status_detail),
    paymentMethod: text(method.id),
    qrCode: text(method.qr_code) || null,
    qrCodeBase64: text(method.qr_code_base64) || null,
    ticketUrl: httpsUrl(method.ticket_url),
    challengeUrl: httpsUrl(security.url),
  };
}

export function mercadoPagoAmountCents(order: Record<string, unknown>): number | null {
  const value = Number(order.total_amount);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

export async function reconcileMercadoPagoOrder(
  admin: SupabaseClient,
  orderId: string,
  paymentAttemptId: string,
  providerOrder: Record<string, unknown>,
): Promise<{ outcome: string; orderStatus: string; payment: MercadoPagoOrderView }> {
  const view = mercadoPagoOrderView(providerOrder);
  const sanitized = sanitizeMercadoPagoOrder(providerOrder);
  const externalReference = text(providerOrder.external_reference);
  const providerAmountCents = mercadoPagoAmountCents(providerOrder);
  // O sandbox da Orders API aceita Pix somente com a fixture oficial de R$ 50.
  // Essa excecao depende de uma configuracao explicita e nunca e aplicada em producao.
  const validTestPixFixture = mercadoPagoConfig().environment === "test"
    && view.paymentMethod === "pix"
    && providerAmountCents === 5_000;
  const { data: localOrder, error: orderError } = await admin
    .from("orders")
    .select("id, total_amount_cents")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !localOrder) throw new MercadoPagoError("ORDER_NOT_FOUND", "Pedido não encontrado.", 404);
  if (
    externalReference !== orderId
    || (!validTestPixFixture && providerAmountCents !== Number(localOrder.total_amount_cents))
  ) {
    throw new MercadoPagoError("PAYMENT_MISMATCH", "O pagamento retornado não corresponde ao pedido.", 409);
  }

  if (view.status === "processed" && (view.statusDetail === "accredited" || text(providerOrder.status) === "processed")) {
    const { data: outcome, error } = await admin.rpc("finalize_paid_order", {
      target_order_id: orderId,
      target_payment_attempt_id: paymentAttemptId,
      external_order_id: view.providerOrderId,
      external_payment_id: view.providerPaymentId ?? "",
      external_status: view.status,
      external_status_detail: view.statusDetail,
      sanitized_response: sanitized,
    });
    if (error) throw new MercadoPagoError("PAYMENT_RECONCILIATION_FAILED", "Não foi possível confirmar o pagamento.", 500);
    if (outcome === "refund_required") {
      return await refundPaymentWithoutInventory(admin, orderId, paymentAttemptId, view, sanitized);
    }
    return { outcome: String(outcome), orderStatus: String(outcome), payment: view };
  }

  const { data: orderStatus, error } = await admin.rpc("record_payment_state", {
    target_order_id: orderId,
    target_payment_attempt_id: paymentAttemptId,
    external_order_id: view.providerOrderId,
    external_payment_id: view.providerPaymentId ?? "",
    external_status: view.status || "unknown",
    external_status_detail: view.statusDetail,
    sanitized_response: sanitized,
  });
  if (error) throw new MercadoPagoError("PAYMENT_RECONCILIATION_FAILED", "Não foi possível atualizar o pagamento.", 500);
  return { outcome: view.status, orderStatus: String(orderStatus), payment: view };
}

async function refundPaymentWithoutInventory(
  admin: SupabaseClient,
  orderId: string,
  paymentAttemptId: string,
  payment: MercadoPagoOrderView,
  originalResponse: Record<string, unknown>,
): Promise<{ outcome: string; orderStatus: string; payment: MercadoPagoOrderView }> {
  const idempotencyKey = `refund-${paymentAttemptId}`;
  try {
    const refund = await mercadoPagoRequest<Record<string, unknown>>(
      `/v1/orders/${encodeURIComponent(payment.providerOrderId)}/refund`,
      {
        method: "POST",
        idempotencyKey,
        body: { transactions: [{ id: payment.providerPaymentId }] },
      },
    );
    const refundRows = object(refund.transactions).refunds;
    const firstRefund = Array.isArray(refundRows) ? object(refundRows[0]) : {};
    const refundId = text(firstRefund.id);
    const { error } = await admin.rpc("complete_automatic_refund", {
      target_order_id: orderId,
      target_payment_attempt_id: paymentAttemptId,
      external_refund_id: refundId,
      refund_succeeded: true,
      sanitized_response: { id: text(refund.id), status: text(refund.status), status_detail: text(refund.status_detail), refund_id: refundId },
    });
    if (error) throw error;
    return { outcome: "refunded", orderStatus: "refunded", payment: { ...payment, status: "refunded", statusDetail: "refunded" } };
  } catch (error) {
    await admin.rpc("complete_automatic_refund", {
      target_order_id: orderId,
      target_payment_attempt_id: paymentAttemptId,
      external_refund_id: "",
      refund_succeeded: false,
      sanitized_response: {
        original_payment: originalResponse,
        error: error instanceof MercadoPagoError ? error.code : "AUTOMATIC_REFUND_FAILED",
      },
    });
    return { outcome: "refund_failed", orderStatus: "payment_failed", payment };
  }
}

export async function verifyMercadoPagoWebhookSignature(
  request: Request,
  dataId: string,
): Promise<boolean> {
  const secret = mercadoPagoConfig().webhookSecret;
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  if (!secret || !signature || !requestId || !dataId) return false;

  const parts = Object.fromEntries(signature.split(",").flatMap((part) => {
    const [key, value] = part.trim().split("=", 2);
    return key && value ? [[key, value]] : [];
  }));
  const timestamp = parts.ts;
  const expectedHex = parts.v1;
  if (!timestamp || !expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = Uint8Array.from(expectedHex.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
  return await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(manifest));
}

export function mercadoPagoPublicError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof MercadoPagoError) return { code: error.code, message: error.message, status: error.status };
  return { code: "INTERNAL_ERROR", message: "Não foi possível concluir o pagamento.", status: 500 };
}
