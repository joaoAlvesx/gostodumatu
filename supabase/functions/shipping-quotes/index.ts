import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  melhorEnvioConfig,
  melhorEnvioPublicError,
  melhorEnvioRequest,
} from "../_shared/melhor-envio.ts";
import { createAdminClient, requireAuthenticatedUser } from "../_shared/supabase.ts";

type RequestedItem = { productId: string; quantity: number };
type ProductRow = {
  id: string;
  name: string;
  price: number | string;
  producer_id: string | null;
  stock_quantity: number;
  weight_grams: number | null;
  height_cm: number | string | null;
  width_cm: number | string | null;
  length_cm: number | string | null;
  checkout_status: string;
};
type QuoteOption = {
  serviceId: number;
  serviceName: string;
  carrier: { id: number | null; name: string; picture: string | null };
  priceCents: number;
  deliveryDays: number | null;
  packages: unknown[];
};
type QuoteGroup = {
  producerId: string;
  producerName: string;
  items: Array<{ productId: string; name: string; quantity: number }>;
  options: QuoteOption[];
};
type QuoteResult = {
  quoteSessionId: string;
  expiresAt: string;
  destinationPostalCode: string;
  groups: QuoteGroup[];
};

class QuoteError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

function onlyDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function validUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeItems(value: unknown): RequestedItem[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new QuoteError("INVALID_CART", "O carrinho deve conter entre 1 e 50 produtos.");
  }
  const quantities = new Map<string, number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") throw new QuoteError("INVALID_CART", "Item do carrinho inválido.");
    const productId = (raw as Record<string, unknown>).productId;
    const quantity = Number((raw as Record<string, unknown>).quantity);
    if (!validUuid(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new QuoteError("INVALID_CART", "Cada item precisa de produto e quantidade válida.");
    }
    const total = (quantities.get(productId) ?? 0) + quantity;
    if (total > 1000) throw new QuoteError("INVALID_CART", "A quantidade máxima por produto é 1000.");
    quantities.set(productId, total);
  }
  return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity }))
    .sort((left, right) => left.productId.localeCompare(right.productId));
}

function cents(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function normalizeOptions(value: unknown): QuoteOption[] {
  if (!Array.isArray(value)) {
    throw new QuoteError("SHIPPING_QUOTE_FAILED", "O Melhor Envio retornou uma cotação inválida.", 502);
  }

  return value.flatMap((raw): QuoteOption[] => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const serviceId = Number(row.id);
    const priceCents = cents(row.custom_price ?? row.price);
    if (!Number.isInteger(serviceId) || priceCents === null || row.error) return [];
    const company = row.company && typeof row.company === "object"
      ? row.company as Record<string, unknown>
      : {};
    const carrierName = typeof company.name === "string" ? company.name : "Transportadora";
    const packages = Array.isArray(row.packages) ? row.packages : [];
    if (packages.length > 1 && /correios|j&t|loggi/i.test(carrierName)) return [];
    const delivery = Number(row.custom_delivery_time ?? row.delivery_time);
    return [{
      serviceId,
      serviceName: typeof row.name === "string" ? row.name : `Serviço ${serviceId}`,
      carrier: {
        id: Number.isInteger(Number(company.id)) ? Number(company.id) : null,
        name: carrierName,
        picture: typeof company.picture === "string" ? company.picture : null,
      },
      priceCents,
      deliveryDays: Number.isFinite(delivery) && delivery >= 0 ? Math.round(delivery) : null,
      packages,
    }];
  }).sort((left, right) => left.priceCents - right.priceCents);
}

async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function calculateQuote(
  customerId: string,
  destinationPostalCode: string,
  requestedItems: RequestedItem[],
): Promise<QuoteResult> {
  const admin = createAdminClient();
  const { count: recentQuoteCount, error: rateLimitError } = await admin
    .from("shipping_quote_sessions")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .gt("created_at", new Date(Date.now() - 60 * 1000).toISOString());
  if (rateLimitError) throw new QuoteError("QUOTE_RATE_LIMIT_FAILED", "Não foi possível validar o limite de cotações.", 500);
  if ((recentQuoteCount ?? 0) >= 20) {
    throw new QuoteError("TOO_MANY_QUOTES", "Aguarde um minuto antes de calcular o frete novamente.", 429);
  }

  const productIds = requestedItems.map(({ productId }) => productId);
  const { data: productData, error: productError } = await admin
    .from("products")
    .select("id, name, price, producer_id, stock_quantity, weight_grams, height_cm, width_cm, length_cm, checkout_status")
    .in("id", productIds);
  if (productError) throw new QuoteError("CATALOG_RELOAD_FAILED", "Não foi possível validar o carrinho.", 500);

  const products = (productData ?? []) as ProductRow[];
  if (products.length !== requestedItems.length) {
    throw new QuoteError("PRODUCT_UNAVAILABLE", "Um produto do carrinho não está mais disponível.", 409);
  }
  const productsById = new Map(products.map((product) => [product.id, product]));

  const { data: reservations, error: reservationsError } = await admin
    .from("inventory_reservations")
    .select("product_id, quantity")
    .in("product_id", productIds)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());
  if (reservationsError) throw new QuoteError("INVENTORY_RELOAD_FAILED", "Não foi possível validar o estoque.", 500);
  const reservedByProduct = new Map<string, number>();
  for (const reservation of reservations ?? []) {
    reservedByProduct.set(
      reservation.product_id,
      (reservedByProduct.get(reservation.product_id) ?? 0) + reservation.quantity,
    );
  }

  const producerIds = new Set<string>();
  for (const requested of requestedItems) {
    const product = productsById.get(requested.productId)!;
    const dimensions = [product.weight_grams, product.height_cm, product.width_cm, product.length_cm];
    if (product.checkout_status !== "available" || !product.producer_id || dimensions.some((value) => Number(value) <= 0)) {
      throw new QuoteError("PRODUCT_UNAVAILABLE", `${product.name} está incompleto ou indisponível para entrega.`, 409);
    }
    const available = product.stock_quantity - (reservedByProduct.get(product.id) ?? 0);
    if (requested.quantity > available) {
      throw new QuoteError("INSUFFICIENT_STOCK", `Estoque insuficiente para ${product.name}.`, 409);
    }
    producerIds.add(product.producer_id);
  }

  const producerIdList = Array.from(producerIds);
  const [{ data: profiles, error: profileError }, { data: producers, error: producersError }] = await Promise.all([
    admin
      .from("producer_fulfillment_profiles")
      .select("producer_id, origin_postal_code, is_active")
      .in("producer_id", producerIdList),
    admin.from("producers").select("id, name").in("id", producerIdList),
  ]);
  if (profileError || producersError) {
    throw new QuoteError("ORIGIN_RELOAD_FAILED", "Não foi possível validar as origens de entrega.", 500);
  }
  const profileByProducer = new Map((profiles ?? []).map((profile) => [profile.producer_id, profile]));
  const producerNameById = new Map((producers ?? []).map((producer) => [producer.id, producer.name]));

  const groupedItems = new Map<string, Array<{ product: ProductRow; quantity: number }>>();
  for (const requested of requestedItems) {
    const product = productsById.get(requested.productId)!;
    const group = groupedItems.get(product.producer_id!) ?? [];
    group.push({ product, quantity: requested.quantity });
    groupedItems.set(product.producer_id!, group);
  }

  const config = melhorEnvioConfig();
  const groups = await Promise.all(Array.from(groupedItems, async ([producerId, items]): Promise<QuoteGroup> => {
    const profile = profileByProducer.get(producerId);
    if (!profile?.is_active) {
      throw new QuoteError("ORIGIN_UNAVAILABLE", `${producerNameById.get(producerId) ?? "Produtor"} não possui origem de entrega ativa.`, 409);
    }
    const payload: Record<string, unknown> = {
      from: { postal_code: profile.origin_postal_code },
      to: { postal_code: destinationPostalCode },
      products: items.map(({ product, quantity }) => ({
        id: product.id,
        width: Number(product.width_cm),
        height: Number(product.height_cm),
        length: Number(product.length_cm),
        weight: Number(product.weight_grams) / 1000,
        insurance_value: Number(Number(product.price).toFixed(2)),
        quantity,
      })),
      options: { receipt: false, own_hand: false },
    };
    if (config.services) payload.services = config.services;
    const response = await melhorEnvioRequest<unknown>(admin, "/api/v2/me/shipment/calculate", {
      method: "POST",
      body: payload,
    });
    const options = normalizeOptions(response);
    if (options.length === 0) {
      throw new QuoteError("NO_SHIPPING_SERVICE", `Nenhum frete disponível para ${producerNameById.get(producerId) ?? "um produtor"}.`, 409);
    }
    return {
      producerId,
      producerName: producerNameById.get(producerId) ?? "Produtor",
      items: items.map(({ product, quantity }) => ({ productId: product.id, name: product.name, quantity })),
      options,
    };
  }));

  const cartSnapshot = requestedItems.map(({ productId, quantity }) => {
    const product = productsById.get(productId)!;
    return {
      productId,
      producerId: product.producer_id,
      quantity,
      unitPriceCents: Math.round(Number(product.price) * 100),
      weightGrams: product.weight_grams,
      heightCm: Number(product.height_cm),
      widthCm: Number(product.width_cm),
      lengthCm: Number(product.length_cm),
    };
  });
  const ttl = Math.min(Math.max(Number(Deno.env.get("MELHOR_ENVIO_QUOTE_TTL_MINUTES") ?? 15), 5), 60);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  const { data: session, error: sessionError } = await admin
    .from("shipping_quote_sessions")
    .insert({
      customer_id: customerId,
      destination_postal_code: destinationPostalCode,
      cart_fingerprint: await fingerprint({ destinationPostalCode, cartSnapshot }),
      cart_snapshot: cartSnapshot,
      quotes_snapshot: groups,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (sessionError || !session) throw new QuoteError("QUOTE_STORAGE_FAILED", "Não foi possível guardar a cotação.", 500);

  return { quoteSessionId: session.id, expiresAt, destinationPostalCode, groups };
}

async function handleRequote(userId: string, body: Record<string, unknown>): Promise<Response | QuoteResult> {
  const quoteSessionId = body.quoteSessionId;
  const selections = body.selections;
  if (!validUuid(quoteSessionId) || !Array.isArray(selections)) {
    throw new QuoteError("INVALID_SELECTION", "Informe a cotação e uma escolha por produtor.");
  }
  const admin = createAdminClient();
  const { data: previous, error } = await admin
    .from("shipping_quote_sessions")
    .select("customer_id, destination_postal_code, cart_snapshot, quotes_snapshot, expires_at")
    .eq("id", quoteSessionId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (error) throw new QuoteError("QUOTE_RELOAD_FAILED", "Não foi possível validar a cotação.", 500);
  if (!previous || new Date(previous.expires_at).getTime() <= Date.now()) {
    throw new QuoteError("QUOTE_EXPIRED", "A cotação expirou. Calcule o frete novamente.", 409);
  }

  const selectionMap = new Map<string, number>();
  for (const selection of selections) {
    if (!selection || typeof selection !== "object") throw new QuoteError("INVALID_SELECTION", "Escolha de frete inválida.");
    const producerId = (selection as Record<string, unknown>).producerId;
    const serviceId = Number((selection as Record<string, unknown>).serviceId);
    if (!validUuid(producerId) || !Number.isInteger(serviceId) || selectionMap.has(producerId)) {
      throw new QuoteError("INVALID_SELECTION", "Escolha uma única opção para cada produtor.");
    }
    selectionMap.set(producerId, serviceId);
  }

  const previousGroups = previous.quotes_snapshot as QuoteGroup[];
  if (selectionMap.size !== previousGroups.length) {
    throw new QuoteError("INVALID_SELECTION", "Escolha uma opção de frete para cada produtor.");
  }
  const requestedItems = (previous.cart_snapshot as Array<Record<string, unknown>>).map((item) => ({
    productId: String(item.productId),
    quantity: Number(item.quantity),
  }));
  const current = await calculateQuote(userId, previous.destination_postal_code, requestedItems);

  let changed = false;
  const confirmedSelections = current.groups.map((group) => {
    const serviceId = selectionMap.get(group.producerId);
    const oldGroup = previousGroups.find((candidate) => candidate.producerId === group.producerId);
    const oldOption = oldGroup?.options.find((option) => option.serviceId === serviceId);
    const currentOption = group.options.find((option) => option.serviceId === serviceId);
    if (!oldOption || !currentOption || oldOption.priceCents !== currentOption.priceCents) changed = true;
    return currentOption ? {
      producerId: group.producerId,
      serviceId: currentOption.serviceId,
      serviceName: currentOption.serviceName,
      carrier: currentOption.carrier,
      priceCents: currentOption.priceCents,
      deliveryDays: currentOption.deliveryDays,
    } : null;
  });

  if (changed) {
    return jsonResponse({
      error: { code: "QUOTE_CHANGED", message: "O preço ou a disponibilidade do frete mudou." },
      quote: current,
    }, 409);
  }
  return new Response(JSON.stringify({ confirmed: true, quote: current, selections: confirmedSelections }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
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
    return errorResponse("UNAUTHORIZED", "Entre na sua conta para calcular o frete.", 401, headers);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }

  try {
    if (body.action === "requote") {
      const result = await handleRequote(user.id, body);
      if (result instanceof Response) {
        const responseHeaders = new Headers(result.headers);
        Object.entries(headers).forEach(([key, value]) => responseHeaders.set(key, String(value)));
        return new Response(result.body, { status: result.status, headers: responseHeaders });
      }
      return jsonResponse(result, 200, headers);
    }

    const postalCode = onlyDigits(body.postalCode);
    if (postalCode.length !== 8) throw new QuoteError("INVALID_POSTAL_CODE", "Informe um CEP de destino com 8 números.");
    const result = await calculateQuote(user.id, postalCode, normalizeItems(body.items));
    return jsonResponse(result, 200, headers);
  } catch (error) {
    if (error instanceof QuoteError) return errorResponse(error.code, error.message, error.status, headers);
    const publicError = melhorEnvioPublicError(error);
    return errorResponse(publicError.code, publicError.message, publicError.status, headers);
  }
});
