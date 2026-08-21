import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { mercadoPagoConfig } from "../_shared/mercado-pago.ts";
import { createAdminClient, requireAuthenticatedUser } from "../_shared/supabase.ts";

class CheckoutError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

function validUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function validClientKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function requote(request: Request, body: Record<string, unknown>): Promise<{
  quote: Record<string, unknown>;
  selections: Record<string, unknown>[];
}> {
  const authorization = request.headers.get("authorization");
  if (!authorization) throw new CheckoutError("UNAUTHORIZED", "Entre na sua conta para continuar.", 401);
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/shipping-quotes`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authorization,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "requote",
      quoteSessionId: body.quoteSessionId,
      selections: body.selections,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = asObject(payload.error);
    throw new CheckoutError(
      text(error.code) || "SHIPPING_REQUOTE_FAILED",
      text(error.message) || "Não foi possível confirmar o frete.",
      response.status,
    );
  }
  if (payload.confirmed !== true || !Array.isArray(payload.selections)) {
    throw new CheckoutError("INVALID_SHIPPING_CONFIRMATION", "A confirmação do frete é inválida.", 502);
  }
  return { quote: asObject(payload.quote), selections: payload.selections as Record<string, unknown>[] };
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
    return errorResponse("UNAUTHORIZED", "Entre na sua conta para finalizar a compra.", 401, headers);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }

  try {
    if (!validUuid(body.quoteSessionId) || !validUuid(body.addressId) || !validClientKey(body.idempotencyKey)) {
      throw new CheckoutError("INVALID_CHECKOUT", "Informe endereço, cotação e identificador válidos.");
    }
    if (!user.email_confirmed_at) {
      throw new CheckoutError("EMAIL_NOT_CONFIRMED", "Confirme seu e-mail antes de finalizar a compra.", 403);
    }

    const admin = createAdminClient();
    const mercadoPago = mercadoPagoConfig();
    const [{ data: profile, error: profileError }, { data: address, error: addressError }] = await Promise.all([
      admin.from("customer_profiles").select("id, full_name, email, phone, tax_id").eq("id", user.id).maybeSingle(),
      admin.from("customer_addresses").select("*").eq("id", body.addressId).eq("customer_id", user.id).maybeSingle(),
    ]);
    if (profileError || addressError) throw new CheckoutError("CUSTOMER_RELOAD_FAILED", "Não foi possível carregar seus dados.", 500);
    if (!profile || !address) throw new CheckoutError("CUSTOMER_DATA_REQUIRED", "Complete seus dados e escolha um endereço de entrega.", 409);

    const phone = digits(profile.phone);
    const taxId = digits(profile.tax_id);
    if (!text(profile.full_name) || !text(profile.email).includes("@") || phone.length < 10 || ![11, 14].includes(taxId.length)) {
      throw new CheckoutError(
        "CUSTOMER_DATA_REQUIRED",
        "Complete nome, telefone e CPF/CNPJ em Minha conta antes de pagar.",
        409,
      );
    }

    const confirmation = await requote(request, body);
    const quoteGroups = Array.isArray(confirmation.quote.groups)
      ? confirmation.quote.groups as Record<string, unknown>[]
      : [];
    if (!quoteGroups.length || confirmation.selections.length !== quoteGroups.length) {
      throw new CheckoutError("INVALID_SHIPPING_CONFIRMATION", "Escolha um frete para cada produtor.");
    }

    const cartItems = quoteGroups.flatMap((group) => {
      const items = Array.isArray(group.items) ? group.items as Record<string, unknown>[] : [];
      return items.map((item) => ({ product_id: item.productId, quantity: Number(item.quantity) }));
    });
    const shippingCostCents = confirmation.selections.reduce((sum, selection) => sum + Number(selection.priceCents || 0), 0);
    if (!cartItems.length || !Number.isSafeInteger(shippingCostCents) || shippingCostCents < 0) {
      throw new CheckoutError("INVALID_SHIPPING_CONFIRMATION", "A confirmação do carrinho é inválida.", 502);
    }

    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const orderKey = `checkout-${user.id}-${body.idempotencyKey}`;
    const { data: existingOrder, error: existingOrderError } = await admin
      .from("orders")
      .select("id")
      .eq("idempotency_key", orderKey)
      .maybeSingle();
    if (existingOrderError) throw new CheckoutError("ORDER_RELOAD_FAILED", "Não foi possível validar a tentativa.", 500);
    if (!existingOrder) {
      const { count: activeCheckoutCount, error: rateLimitError } = await admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", user.id)
        .eq("status", "awaiting_payment")
        .gt("inventory_expires_at", new Date().toISOString());
      if (rateLimitError) throw new CheckoutError("CHECKOUT_RATE_LIMIT_FAILED", "Não foi possível validar a tentativa.", 500);
      if ((activeCheckoutCount ?? 0) >= 5) {
        throw new CheckoutError("TOO_MANY_ACTIVE_CHECKOUTS", "Você já possui pedidos aguardando pagamento. Aguarde a expiração ou conclua um deles.", 429);
      }
    }
    const customerSnapshot = {
      name: text(profile.full_name),
      email: text(profile.email),
      phone,
      tax_id: taxId,
    };
    const shippingAddress = {
      recipient_name: text(address.recipient_name),
      recipient_phone: digits(address.recipient_phone) || phone,
      postal_code: digits(address.postal_code),
      street: text(address.street),
      number: text(address.number),
      complement: text(address.complement) || null,
      neighborhood: text(address.neighborhood),
      city: text(address.city),
      state: text(address.state).toUpperCase(),
    };
    const { data: orderId, error: orderError } = await admin.rpc("create_order_with_inventory", {
      customer_profile_id: user.id,
      customer_data: customerSnapshot,
      shipping_address_data: shippingAddress,
      cart_items: cartItems,
      request_idempotency_key: orderKey,
      shipping_cost_cents: shippingCostCents,
      discount_cents: 0,
      reservation_expires_at: expiresAt,
    });
    if (orderError || !orderId) {
      const message = orderError?.message ?? "";
      if (/insufficient stock/i.test(message)) throw new CheckoutError("INSUFFICIENT_STOCK", "Um produto ficou sem estoque.", 409);
      throw new CheckoutError("ORDER_CREATION_FAILED", "Não foi possível reservar os produtos.", 500);
    }

    const { data: order, error: readError } = await admin
      .from("orders")
      .select("id, order_number, customer_id, status, subtotal_amount_cents, shipping_amount_cents, total_amount_cents, inventory_expires_at")
      .eq("id", orderId)
      .maybeSingle();
    if (readError || !order || order.customer_id !== user.id) throw new CheckoutError("ORDER_RELOAD_FAILED", "Não foi possível carregar o pedido.", 500);
    if (order.status === "expired") throw new CheckoutError("CHECKOUT_EXPIRED", "Esta tentativa expirou. Inicie o pagamento novamente.", 409);
    if (Number(order.shipping_amount_cents) !== shippingCostCents) {
      throw new CheckoutError("IDEMPOTENCY_CONFLICT", "Esta tentativa já foi usada com outro frete.", 409);
    }

    const currentQuoteSessionId = text(confirmation.quote.quoteSessionId);
    const updates = confirmation.selections.map(async (selection) => {
      const producerId = text(selection.producerId);
      const serviceId = Number(selection.serviceId);
      const group = quoteGroups.find((candidate) => text(candidate.producerId) === producerId);
      const options = Array.isArray(group?.options) ? group.options as Record<string, unknown>[] : [];
      const option = options.find((candidate) => Number(candidate.serviceId) === serviceId);
      if (!validUuid(producerId) || !option) throw new CheckoutError("INVALID_SHIPPING_CONFIRMATION", "Serviço de frete inválido.", 502);
      const carrier = asObject(option.carrier);
      const { error } = await admin.from("shipments").update({
        quote_session_id: currentQuoteSessionId,
        service_id: serviceId,
        quoted_at: new Date().toISOString(),
        shipping_amount_cents: Number(option.priceCents),
        carrier: text(carrier.name),
        service_name: text(option.serviceName),
        package_snapshot: {
          quoteSessionId: currentQuoteSessionId,
          serviceId,
          packages: Array.isArray(option.packages) ? option.packages : [],
        },
        status: "quoted",
        label_error: null,
      }).eq("order_id", orderId).eq("producer_id", producerId);
      if (error) throw new CheckoutError("SHIPMENT_UPDATE_FAILED", "Não foi possível salvar o frete selecionado.", 500);
    });
    await Promise.all(updates);

    return jsonResponse({
      order: {
        id: order.id,
        number: order.order_number,
        status: order.status,
        subtotalCents: Number(order.subtotal_amount_cents),
        shippingCents: Number(order.shipping_amount_cents),
        totalCents: Number(order.total_amount_cents),
        expiresAt: order.inventory_expires_at,
      },
      publicKey: mercadoPago.publicKey,
      quoteSessionId: currentQuoteSessionId,
      selections: confirmation.selections,
    }, 200, headers);
  } catch (error) {
    if (error instanceof CheckoutError) return errorResponse(error.code, error.message, error.status, headers);
    return errorResponse("INTERNAL_ERROR", "Não foi possível iniciar o checkout.", 500, headers);
  }
});
