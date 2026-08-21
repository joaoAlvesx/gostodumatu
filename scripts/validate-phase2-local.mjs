import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "TesteLocal123!";
const OWN_PRODUCER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PRODUCER_ID = "10000000-0000-4000-8000-000000000002";
const OWN_PRODUCT_ID = "20000000-0000-4000-8000-000000000001";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function localStatus() {
  const output = execFileSync(
    "npx",
    ["--yes", "supabase@latest", "status", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const status = JSON.parse(output);
  assert(status.API_URL?.startsWith("http://127.0.0.1:"), "validação limitada ao Supabase local");
  return status;
}

async function authenticatedClient(apiUrl, key, email) {
  const client = createClient(apiUrl, key, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function main() {
  const status = localStatus();
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const service = createClient(status.API_URL, serviceKey, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, publicKey, { auth: { persistSession: false } });
  const admin = await authenticatedClient(status.API_URL, publicKey, "admin@local.test");
  const producer = await authenticatedClient(status.API_URL, publicKey, "produtor@local.test");
  const customer = await authenticatedClient(status.API_URL, publicKey, "cliente@local.test");
  const adminUser = (await admin.auth.getUser()).data.user;
  const producerUser = (await producer.auth.getUser()).data.user;
  const customerUser = (await customer.auth.getUser()).data.user;
  if (!adminUser || !producerUser || !customerUser) throw new Error("Usuários locais não encontrados.");

  const { data: product, error: productError } = await service
    .from("products")
    .select("stock_quantity, weight_grams, height_cm, width_cm, length_cm, checkout_status")
    .eq("id", OWN_PRODUCT_ID)
    .single();
  assert(
    !productError
      && product.stock_quantity === 5
      && product.weight_grams === 500
      && product.checkout_status === "available"
      && [product.height_cm, product.width_cm, product.length_cm].every((value) => Number(value) > 0),
    "produto possui estoque, embalagem e disponibilidade para checkout",
  );

  const { data: anonymousFulfillment, error: anonymousFulfillmentError } = await anonymous
    .from("producer_fulfillment_profiles")
    .select("producer_id");
  assert(
    Boolean(anonymousFulfillmentError) || anonymousFulfillment?.length === 0,
    "dados privados de expedição não são públicos",
  );

  const { data: ownFulfillment, error: ownFulfillmentError } = await producer
    .from("producer_fulfillment_profiles")
    .select("producer_id, origin_postal_code")
    .single();
  assert(
    !ownFulfillmentError
      && ownFulfillment?.producer_id === OWN_PRODUCER_ID
      && ownFulfillment.origin_postal_code === "79240000",
    "produtor lê somente seu perfil privado de expedição",
  );

  await producer
    .from("producer_fulfillment_profiles")
    .update({ special_instructions: "tentativa indevida" })
    .eq("producer_id", OTHER_PRODUCER_ID);
  const { data: protectedFulfillment } = await service
    .from("producer_fulfillment_profiles")
    .select("special_instructions")
    .eq("producer_id", OTHER_PRODUCER_ID)
    .single();
  assert(
    protectedFulfillment?.special_instructions !== "tentativa indevida",
    "RLS protege a origem de outro produtor",
  );

  const { data: customerProfiles, error: customerProfilesError } = await customer
    .from("customer_profiles")
    .select("id");
  assert(
    !customerProfilesError
      && customerProfiles?.length === 1
      && customerProfiles[0].id === customerUser.id,
    "cliente acessa somente o próprio perfil",
  );

  await customer.from("customer_addresses").delete().eq("customer_id", customerUser.id);
  const { error: ownAddressError } = await customer.from("customer_addresses").insert({
    customer_id: customerUser.id,
    label: "Casa",
    recipient_name: "Comprador Local",
    recipient_phone: "67999999999",
    postal_code: "79240000",
    street: "Rua do Comprador",
    number: "10",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
    is_default: true,
  });
  assert(!ownAddressError, "cliente cadastra o próprio endereço");

  const { error: foreignAddressError } = await customer.from("customer_addresses").insert({
    customer_id: adminUser.id,
    label: "Bloqueado",
    recipient_name: "Tentativa Indevida",
    postal_code: "79240000",
    street: "Rua Bloqueada",
    number: "1",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
  });
  assert(Boolean(foreignAddressError), "cliente não cadastra endereço para outra conta");

  const shippingAddress = {
    recipient_name: "Comprador Local",
    recipient_phone: "67999999999",
    postal_code: "79240000",
    street: "Rua do Comprador",
    number: "10",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
  };
  const customerSnapshot = {
    id: customerUser.id,
    name: "Comprador Local",
    email: customerUser.email,
    phone: "67999999999",
  };
  const firstIdempotencyKey = `phase2-order-primary-${crypto.randomUUID()}`;
  const orderRequest = {
    customer_profile_id: customerUser.id,
    customer_data: customerSnapshot,
    shipping_address_data: shippingAddress,
    cart_items: [{ product_id: OWN_PRODUCT_ID, quantity: 4 }],
    request_idempotency_key: firstIdempotencyKey,
    shipping_cost_cents: 1234,
    discount_cents: 100,
  };
  const [firstOrderResult, repeatedOrderResult] = await Promise.all([
    service.rpc("create_order_with_inventory", orderRequest),
    service.rpc("create_order_with_inventory", orderRequest),
  ]);
  const { data: orderId, error: orderError } = firstOrderResult;
  if (orderError) throw orderError;
  assert(!orderError && Boolean(orderId), "backend cria pedido e reserva estoque em uma transação");

  const { data: repeatedOrderId, error: repeatedOrderError } = repeatedOrderResult;
  assert(
    !repeatedOrderError && repeatedOrderId === orderId,
    "chave de idempotência serializa requisições simultâneas sem duplicar pedido",
  );

  const [{ data: order }, { data: items }, { data: reservations }, { data: shipments }, { data: events }] = await Promise.all([
    service.from("orders").select("*").eq("id", orderId).single(),
    service.from("order_items").select("*").eq("order_id", orderId),
    service.from("inventory_reservations").select("*").eq("order_id", orderId),
    service.from("shipments").select("*").eq("order_id", orderId),
    service.from("order_events").select("event_type").eq("order_id", orderId),
  ]);
  assert(
    order?.subtotal_amount_cents === 10000
      && order.shipping_amount_cents === 1234
      && order.discount_amount_cents === 100
      && order.total_amount_cents === 11134
      && order.status === "awaiting_payment",
    "pedido mantém totais autoritativos em centavos",
  );
  assert(
    items?.length === 1
      && items[0].unit_price_cents === 2500
      && items[0].line_total_cents === 10000
      && items[0].product_snapshot.weight_grams === 500,
    "item preserva preço e embalagem em snapshot",
  );
  assert(
    reservations?.length === 1
      && reservations[0].quantity === 4
      && reservations[0].status === "active",
    "reserva ativa registra a quantidade por item",
  );
  assert(
    shipments?.length === 1
      && shipments[0].producer_id === OWN_PRODUCER_ID
      && shipments[0].origin_address_snapshot.postal_code === "79240000",
    "pedido cria uma remessa por produtor com origem em snapshot",
  );
  assert(
    events?.some((event) => event.event_type === "order_created")
      && events.some((event) => event.event_type === "inventory_reserved"),
    "linha do tempo registra criação e reserva do pedido",
  );

  const [{ data: customerOrders }, { data: customerItems }, { data: customerShipments }] = await Promise.all([
    customer.from("orders").select("id").eq("id", orderId),
    customer.from("order_items").select("id").eq("order_id", orderId),
    customer.from("shipments").select("origin_address_snapshot").eq("order_id", orderId),
  ]);
  assert(
    customerOrders?.length === 1 && customerItems?.length === 1,
    "cliente lê somente seu pedido e seus itens",
  );
  assert(
    customerShipments?.length === 0,
    "endereço privado de origem não é exposto ao cliente",
  );

  const { data: producerShipments } = await producer
    .from("shipments")
    .select("id")
    .eq("order_id", orderId);
  assert(producerShipments?.length === 1, "produtor acessa a remessa que deve preparar");

  const secondIdempotencyKey = `phase2-order-no-stock-${crypto.randomUUID()}`;
  const { error: insufficientStockError } = await service.rpc("create_order_with_inventory", {
    customer_profile_id: customerUser.id,
    customer_data: customerSnapshot,
    shipping_address_data: shippingAddress,
    cart_items: [{ product_id: OWN_PRODUCT_ID, quantity: 2 }],
    request_idempotency_key: secondIdempotencyKey,
  });
  assert(Boolean(insufficientStockError), "bloqueio de linha impede reserva acima do estoque disponível");

  const { data: failedOrders } = await service
    .from("orders")
    .select("id")
    .eq("idempotency_key", secondIdempotencyKey);
  assert(failedOrders?.length === 0, "falha de estoque desfaz a criação completa do pedido");

  const { data: stockAfterReservation } = await service
    .from("products")
    .select("stock_quantity")
    .eq("id", OWN_PRODUCT_ID)
    .single();
  assert(stockAfterReservation?.stock_quantity === 5, "reserva não altera o estoque físico antes do pagamento");

  const { data: paymentAttempt, error: paymentAttemptError } = await service
    .from("payment_attempts")
    .insert({
      order_id: orderId,
      idempotency_key: `phase2-payment-${crypto.randomUUID()}`,
      payment_method: "pix",
      amount_cents: order.total_amount_cents,
      status: "pending",
    })
    .select("id")
    .single();
  assert(!paymentAttemptError && Boolean(paymentAttempt?.id), "tentativa de pagamento pode ser conciliada ao pedido");

  const { error: refundError } = await service.from("refunds").insert({
    order_id: orderId,
    payment_attempt_id: paymentAttempt.id,
    idempotency_key: `phase2-refund-${crypto.randomUUID()}`,
    amount_cents: 1000,
    status: "pending",
    reason: "Validação local",
  });
  assert(!refundError, "reembolso mantém vínculo com pedido e tentativa de pagamento");

  const externalEventId = `phase2-webhook-${crypto.randomUUID()}`;
  const { error: webhookError } = await service.from("webhook_events").insert({
    provider: "mercado_pago",
    external_event_id: externalEventId,
    event_type: "order.updated",
    signature_valid: true,
    payload: { local: true },
  });
  const { error: duplicateWebhookError } = await service.from("webhook_events").insert({
    provider: "mercado_pago",
    external_event_id: externalEventId,
    event_type: "order.updated",
    signature_valid: true,
    payload: { local: true },
  });
  assert(!webhookError && Boolean(duplicateWebhookError), "evento externo é persistido de forma idempotente");

  const { error: jobError } = await service.from("fulfillment_jobs").insert({
    order_id: orderId,
    shipment_id: shipments[0].id,
    job_type: "quote_shipment",
    idempotency_key: `phase2-job-${crypto.randomUUID()}`,
    payload: { local: true },
  });
  assert(!jobError, "fila de expedição registra trabalho idempotente");

  const { error: clientPaymentWriteError } = await customer.from("payment_attempts").insert({
    order_id: orderId,
    idempotency_key: `blocked-payment-${crypto.randomUUID()}`,
    amount_cents: 1,
  });
  assert(Boolean(clientPaymentWriteError), "cliente não grava pagamentos diretamente");

  await service
    .from("inventory_reservations")
    .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq("order_id", orderId);
  const { data: expiredCount, error: expirationError } = await service.rpc(
    "expire_inventory_reservations",
  );
  const { data: expiredOrder } = await service
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  assert(
    !expirationError && expiredCount === 1 && expiredOrder?.status === "expired",
    "expiração libera a reserva e atualiza o pedido",
  );

  const concurrentOrderRequest = (idempotencyKey) => ({
    customer_profile_id: customerUser.id,
    customer_data: customerSnapshot,
    shipping_address_data: shippingAddress,
    cart_items: [{ product_id: OWN_PRODUCT_ID, quantity: 4 }],
    request_idempotency_key: idempotencyKey,
  });
  const concurrentResults = await Promise.all([
    service.rpc(
      "create_order_with_inventory",
      concurrentOrderRequest(`phase2-concurrent-a-${crypto.randomUUID()}`),
    ),
    service.rpc(
      "create_order_with_inventory",
      concurrentOrderRequest(`phase2-concurrent-b-${crypto.randomUUID()}`),
    ),
  ]);
  const successfulConcurrentOrders = concurrentResults.filter(
    (result) => !result.error && Boolean(result.data),
  );
  const rejectedConcurrentOrders = concurrentResults.filter((result) => Boolean(result.error));
  assert(
    successfulConcurrentOrders.length === 1 && rejectedConcurrentOrders.length === 1,
    "bloqueio de linha libera o estoque expirado e impede sobrevenda concorrente",
  );

  console.log("\nFase 2 validada no ambiente local; nenhuma API externa foi chamada.");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  process.exitCode = 1;
});
