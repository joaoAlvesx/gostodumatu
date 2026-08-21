import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { melhorEnvioPublicError, melhorEnvioRequest } from "../_shared/melhor-envio.ts";
import { createAdminClient, requestUsesServiceRole, requireSuperAdmin } from "../_shared/supabase.ts";

type Shipment = {
  id: string;
  order_id: string;
  producer_id: string;
  status: string;
  origin_address_snapshot: Record<string, unknown>;
  destination_address_snapshot: Record<string, unknown>;
  package_snapshot: Record<string, unknown>;
  shipping_amount_cents: number;
  carrier: string | null;
  service_name: string | null;
  service_id: number | null;
  external_shipment_id: string | null;
  tracking_code: string | null;
  label_url: string | null;
  provider_metadata: Record<string, unknown>;
};
type Context = {
  shipment: Shipment;
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  profile: Record<string, unknown>;
};

class FulfillmentError extends Error {
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

function decimal(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function documentFields(taxId: unknown): Record<string, string> {
  const value = digits(taxId);
  if (value.length === 11) return { document: value };
  if (value.length === 14) return { company_document: value };
  throw new FulfillmentError("INCOMPLETE_LABEL_DATA", "Informe um CPF ou CNPJ válido para remetente e destinatário.", 409);
}

function addressPayload(
  address: Record<string, unknown>,
  identity: { name: unknown; phone: unknown; email: unknown; taxId: unknown },
): Record<string, unknown> {
  const name = text(identity.name);
  const phone = digits(identity.phone);
  const email = text(identity.email);
  const postalCode = digits(address.postal_code);
  if (
    !name || phone.length < 10 || !email.includes("@") || postalCode.length !== 8
    || !text(address.street) || !text(address.number) || !text(address.neighborhood)
    || !text(address.city) || text(address.state).length !== 2
  ) {
    throw new FulfillmentError("INCOMPLETE_LABEL_DATA", "Os dados de contato ou endereço da etiqueta estão incompletos.", 409);
  }
  return {
    name,
    phone,
    email,
    ...documentFields(identity.taxId),
    address: text(address.street),
    complement: text(address.complement) || undefined,
    number: text(address.number),
    district: text(address.neighborhood),
    city: text(address.city),
    state_abbr: text(address.state).toUpperCase(),
    country_id: "BR",
    postal_code: postalCode,
  };
}

function quoteVolumes(packages: unknown, items: Array<Record<string, unknown>>): Array<Record<string, number>> {
  const normalized = Array.isArray(packages) ? packages.flatMap((raw): Array<Record<string, number>> => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const dimensions = row.dimensions && typeof row.dimensions === "object"
      ? row.dimensions as Record<string, unknown>
      : row;
    const volume = {
      height: decimal(dimensions.height),
      width: decimal(dimensions.width),
      length: decimal(dimensions.length),
      weight: decimal(row.weight),
    };
    return Object.values(volume).every((value) => value > 0) ? [volume] : [];
  }) : [];
  if (normalized.length) return normalized;

  const fallback: Array<Record<string, number>> = [];
  for (const item of items) {
    const snapshot = item.product_snapshot && typeof item.product_snapshot === "object"
      ? item.product_snapshot as Record<string, unknown>
      : {};
    const quantity = Math.min(Number(item.quantity) || 0, 50 - fallback.length);
    for (let count = 0; count < quantity; count += 1) {
      fallback.push({
        height: decimal(snapshot.height_cm),
        width: decimal(snapshot.width_cm),
        length: decimal(snapshot.length_cm),
        weight: decimal(snapshot.weight_grams) / 1000,
      });
    }
  }
  if (!fallback.length || fallback.some((volume) => Object.values(volume).some((value) => value <= 0))) {
    throw new FulfillmentError("INCOMPLETE_PACKAGE_DATA", "A embalagem da remessa está incompleta.", 409);
  }
  return fallback;
}

async function loadContext(shipmentId: string): Promise<Context> {
  const admin = createAdminClient();
  const { data: shipment, error: shipmentError } = await admin
    .from("shipments")
    .select("id, order_id, producer_id, status, origin_address_snapshot, destination_address_snapshot, package_snapshot, shipping_amount_cents, carrier, service_name, service_id, external_shipment_id, tracking_code, label_url, provider_metadata")
    .eq("id", shipmentId)
    .maybeSingle();
  if (shipmentError) throw new FulfillmentError("SHIPMENT_RELOAD_FAILED", "Não foi possível carregar a remessa.", 500);
  if (!shipment) throw new FulfillmentError("SHIPMENT_NOT_FOUND", "Remessa não encontrada.", 404);

  const [{ data: order, error: orderError }, { data: items, error: itemsError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("orders").select("id, customer_id, status, customer_snapshot").eq("id", shipment.order_id).single(),
    admin
      .from("order_items")
      .select("product_id, product_name, product_snapshot, unit_price_cents, quantity")
      .eq("order_id", shipment.order_id)
      .eq("producer_id", shipment.producer_id),
    admin.from("producer_fulfillment_profiles").select("*").eq("producer_id", shipment.producer_id).single(),
  ]);
  if (orderError || itemsError || profileError || !order || !profile || !items?.length) {
    throw new FulfillmentError("SHIPMENT_DATA_INCOMPLETE", "Não foi possível reunir os dados da remessa.", 409);
  }
  if (order.status !== "paid") {
    throw new FulfillmentError("ORDER_NOT_PAID", "A etiqueta só pode ser processada após o pagamento.", 409);
  }
  return { shipment: shipment as Shipment, order, items, profile };
}

async function recordEvent(context: Context, type: string, payload: Record<string, unknown> = {}): Promise<void> {
  await createAdminClient().from("order_events").insert({
    order_id: context.shipment.order_id,
    event_type: type,
    actor_type: "system",
    payload: { shipment_id: context.shipment.id, ...payload },
  });
}

async function prepareShipment(
  context: Context,
  quoteSessionId: string,
  serviceId: number,
): Promise<Context> {
  const admin = createAdminClient();
  const { data: quote, error } = await admin
    .from("shipping_quote_sessions")
    .select("customer_id, cart_snapshot, quotes_snapshot, expires_at")
    .eq("id", quoteSessionId)
    .maybeSingle();
  if (error) throw new FulfillmentError("QUOTE_RELOAD_FAILED", "Não foi possível carregar a cotação.", 500);
  if (!quote || new Date(quote.expires_at).getTime() <= Date.now()) {
    throw new FulfillmentError("QUOTE_EXPIRED", "A cotação da remessa expirou.", 409);
  }
  if (quote.customer_id !== context.order.customer_id) {
    throw new FulfillmentError("QUOTE_MISMATCH", "A cotação não pertence ao pedido.", 409);
  }

  const quoteGroups = quote.quotes_snapshot as Array<Record<string, unknown>>;
  const group = quoteGroups.find((candidate) => candidate.producerId === context.shipment.producer_id);
  const options = Array.isArray(group?.options) ? group.options as Array<Record<string, unknown>> : [];
  const option = options.find((candidate) => Number(candidate.serviceId) === serviceId);
  if (!option) throw new FulfillmentError("QUOTE_MISMATCH", "O serviço não pertence à cotação desta remessa.", 409);

  const orderQuantities = new Map(context.items.map((item) => [String(item.product_id), Number(item.quantity)]));
  const quoteItems = (quote.cart_snapshot as Array<Record<string, unknown>>)
    .filter((item) => item.producerId === context.shipment.producer_id);
  if (
    quoteItems.length !== context.items.length
    || quoteItems.some((item) => orderQuantities.get(String(item.productId)) !== Number(item.quantity))
  ) {
    throw new FulfillmentError("QUOTE_MISMATCH", "Os itens cotados são diferentes dos itens do pedido.", 409);
  }

  const packageSnapshot = {
    ...context.shipment.package_snapshot,
    quoteSessionId,
    serviceId,
    packages: Array.isArray(option.packages) ? option.packages : [],
  };
  const update = {
    quote_session_id: quoteSessionId,
    service_id: serviceId,
    quoted_at: new Date().toISOString(),
    shipping_amount_cents: Number(option.priceCents),
    carrier: text((option.carrier as Record<string, unknown> | undefined)?.name),
    service_name: text(option.serviceName),
    package_snapshot: packageSnapshot,
    status: context.shipment.external_shipment_id ? context.shipment.status : "quoted",
    label_error: null,
  };
  const { data: updated, error: updateError } = await admin
    .from("shipments")
    .update(update)
    .eq("id", context.shipment.id)
    .select("id, order_id, producer_id, status, origin_address_snapshot, destination_address_snapshot, package_snapshot, shipping_amount_cents, carrier, service_name, service_id, external_shipment_id, tracking_code, label_url, provider_metadata")
    .single();
  if (updateError || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível aplicar a cotação à remessa.", 500);
  await recordEvent(context, "shipping_quote_selected", { service_id: serviceId, amount_cents: option.priceCents });
  return { ...context, shipment: updated as Shipment };
}

function buildCartPayload(context: Context): Record<string, unknown> {
  if (!context.shipment.service_id) throw new FulfillmentError("SHIPPING_SERVICE_REQUIRED", "Selecione o frete antes de criar a etiqueta.", 409);
  const customer = context.order.customer_snapshot as Record<string, unknown>;
  const origin = context.shipment.origin_address_snapshot;
  const destination = context.shipment.destination_address_snapshot;
  const profile = context.profile;
  const products = context.items.map((item) => ({
    name: text(item.product_name),
    quantity: Number(item.quantity),
    unitary_value: Number((Number(item.unit_price_cents) / 100).toFixed(2)),
  }));
  const insuranceValue = products.reduce((sum, product) => sum + product.unitary_value * product.quantity, 0);
  const from = addressPayload(origin, {
    name: profile.contact_name ?? origin.contact_name,
    phone: profile.contact_phone ?? origin.contact_phone,
    email: profile.contact_email,
    taxId: profile.tax_id,
  });
  if (from.document) from.state_register = "ISENTO";
  return {
    service: context.shipment.service_id,
    from,
    to: addressPayload(destination, {
      name: destination.recipient_name ?? customer.name,
      phone: destination.recipient_phone ?? customer.phone,
      email: customer.email,
      taxId: customer.tax_id,
    }),
    products,
    volumes: quoteVolumes(context.shipment.package_snapshot.packages, context.items),
    options: {
      insurance_value: Number(insuranceValue.toFixed(2)),
      receipt: false,
      own_hand: false,
      reverse: false,
      platform: "Gostudumatu",
      reminder: `Pedido ${context.shipment.order_id}`,
    },
  };
}

async function createCartItem(context: Context): Promise<Context> {
  if (context.shipment.external_shipment_id) return context;
  const admin = createAdminClient();
  const response = await melhorEnvioRequest<Record<string, unknown>>(admin, "/api/v2/me/cart", {
    method: "POST",
    body: buildCartPayload(context),
  });
  const externalId = text(response.id);
  if (!externalId) throw new FulfillmentError("INVALID_CART_RESPONSE", "O Melhor Envio não retornou o identificador da etiqueta.", 502);
  const { data: updated, error } = await admin.from("shipments").update({
    external_shipment_id: externalId,
    status: "label_pending",
    label_error: null,
    provider_metadata: { ...context.shipment.provider_metadata, cart: response },
  }).eq("id", context.shipment.id).select("*").single();
  if (error || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível salvar a etiqueta no carrinho.", 500);
  await recordEvent(context, "shipping_label_added_to_cart", { external_shipment_id: externalId });
  return { ...context, shipment: updated as Shipment };
}

async function buyLabel(context: Context): Promise<Context> {
  const externalId = context.shipment.external_shipment_id;
  if (!externalId) throw new FulfillmentError("EXTERNAL_SHIPMENT_REQUIRED", "Crie a etiqueta no carrinho primeiro.", 409);
  if (context.shipment.provider_metadata.purchase) return context;
  const admin = createAdminClient();
  const response = await melhorEnvioRequest<Record<string, unknown>>(admin, "/api/v2/me/shipment/checkout", {
    method: "POST",
    body: { orders: [externalId] },
  });
  const metadata = { ...context.shipment.provider_metadata, purchase: response };
  const { data: updated, error } = await admin.from("shipments").update({ provider_metadata: metadata, label_error: null })
    .eq("id", context.shipment.id).select("*").single();
  if (error || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível registrar a compra da etiqueta.", 500);
  await recordEvent(context, "shipping_label_purchased");
  return { ...context, shipment: updated as Shipment };
}

async function generateLabel(context: Context): Promise<Context> {
  const externalId = context.shipment.external_shipment_id;
  if (!externalId) throw new FulfillmentError("EXTERNAL_SHIPMENT_REQUIRED", "Compre a etiqueta primeiro.", 409);
  if (context.shipment.provider_metadata.generated_at) return context;
  const admin = createAdminClient();
  const response = await melhorEnvioRequest<Record<string, unknown>>(admin, "/api/v2/me/shipment/generate", {
    method: "POST",
    body: { orders: [externalId] },
  });
  const metadata = { ...context.shipment.provider_metadata, generation: response, generated_at: new Date().toISOString() };
  const { data: updated, error } = await admin.from("shipments").update({ provider_metadata: metadata, label_error: null })
    .eq("id", context.shipment.id).select("*").single();
  if (error || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível registrar a geração da etiqueta.", 500);
  await recordEvent(context, "shipping_label_generated");
  return { ...context, shipment: updated as Shipment };
}

async function printLabel(context: Context): Promise<Context> {
  if (context.shipment.label_url) return context;
  const externalId = context.shipment.external_shipment_id;
  if (!externalId) throw new FulfillmentError("EXTERNAL_SHIPMENT_REQUIRED", "Gere a etiqueta primeiro.", 409);
  const admin = createAdminClient();
  const response = await melhorEnvioRequest<Record<string, unknown>>(admin, "/api/v2/me/shipment/print", {
    method: "POST",
    body: { mode: "public", orders: [externalId] },
  });
  const labelUrl = text(response.url);
  if (!labelUrl) throw new FulfillmentError("LABEL_NOT_READY", "A etiqueta ainda não está pronta para impressão.", 409);
  const { data: updated, error } = await admin.from("shipments").update({
    label_url: labelUrl,
    status: "label_created",
    label_error: null,
    provider_metadata: { ...context.shipment.provider_metadata, print: response },
  }).eq("id", context.shipment.id).select("*").single();
  if (error || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível salvar a impressão da etiqueta.", 500);
  await recordEvent(context, "shipping_label_printed");
  return { ...context, shipment: updated as Shipment };
}

async function trackShipment(context: Context): Promise<Context> {
  const externalId = context.shipment.external_shipment_id;
  if (!externalId) throw new FulfillmentError("EXTERNAL_SHIPMENT_REQUIRED", "A remessa ainda não existe no Melhor Envio.", 409);
  const admin = createAdminClient();
  const response = await melhorEnvioRequest<Record<string, unknown>>(admin, "/api/v2/me/shipment/tracking", {
    method: "POST",
    body: { orders: [externalId] },
  });
  const tracking = response[externalId] && typeof response[externalId] === "object"
    ? response[externalId] as Record<string, unknown>
    : response;
  const trackingCode = text(tracking.tracking) || text(tracking.tracking_code) || context.shipment.tracking_code;
  const { data: updated, error } = await admin.from("shipments").update({
    tracking_code: trackingCode || null,
    provider_metadata: { ...context.shipment.provider_metadata, tracking },
  }).eq("id", context.shipment.id).select("*").single();
  if (error || !updated) throw new FulfillmentError("SHIPMENT_UPDATE_FAILED", "Não foi possível salvar o rastreio.", 500);
  await recordEvent(context, "shipping_tracking_refreshed", { tracking_code: trackingCode || null });
  return { ...context, shipment: updated as Shipment };
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (!headers) return errorResponse("ORIGIN_NOT_ALLOWED", "Origem não autorizada.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Método não permitido.", 405, headers);

  if (!requestUsesServiceRole(request)) {
    try {
      await requireSuperAdmin(request);
    } catch (error) {
      return error instanceof Error && error.message === "FORBIDDEN"
        ? errorResponse("FORBIDDEN", "Apenas super administradores podem processar etiquetas nesta fase.", 403, headers)
        : errorResponse("UNAUTHORIZED", "Sessão inválida ou expirada.", 401, headers);
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }
  const shipmentId = body.shipmentId;
  const action = text(body.action);
  if (!validUuid(shipmentId) || !["prepare", "create", "buy", "generate", "print", "track", "run"].includes(action)) {
    return errorResponse("INVALID_INPUT", "Informe uma remessa e uma ação válida.", 422, headers);
  }

  let context: Context | null = null;
  try {
    context = await loadContext(shipmentId);
    if (action === "prepare" || action === "run") {
      const quoteSessionId = body.quoteSessionId;
      const serviceId = Number(body.serviceId);
      if (!validUuid(quoteSessionId) || !Number.isInteger(serviceId)) {
        throw new FulfillmentError("INVALID_SELECTION", "Informe a cotação e o serviço selecionado.");
      }
      context = await prepareShipment(context, quoteSessionId, serviceId);
    }
    if (action === "create" || action === "run") context = await createCartItem(context);
    if (action === "buy" || action === "run") context = await buyLabel(context);
    if (action === "generate" || action === "run") context = await generateLabel(context);
    if (action === "print" || action === "run") context = await printLabel(context);
    if (action === "track") context = await trackShipment(context);

    return jsonResponse({
      shipment: {
        id: context.shipment.id,
        status: context.shipment.status,
        carrier: context.shipment.carrier,
        serviceName: context.shipment.service_name,
        externalShipmentId: context.shipment.external_shipment_id,
        trackingCode: context.shipment.tracking_code,
        labelUrl: context.shipment.label_url,
      },
    }, 200, headers);
  } catch (error) {
    if (context) {
      const code = error instanceof FulfillmentError ? error.code : melhorEnvioPublicError(error).code;
      await createAdminClient().from("shipments").update({ status: "label_error", label_error: code }).eq("id", context.shipment.id);
      await recordEvent(context, "shipping_label_error", { code });
    }
    if (error instanceof FulfillmentError) return errorResponse(error.code, error.message, error.status, headers);
    const publicError = melhorEnvioPublicError(error);
    return errorResponse(publicError.code, publicError.message, publicError.status, headers);
  }
});
