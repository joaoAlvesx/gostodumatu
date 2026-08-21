import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "TesteLocal123!";
const CUSTOMER_EMAIL = "cliente@local.test";
const PRODUCT_A = "20000000-0000-4000-8000-000000000001";
const PRODUCT_B = "20000000-0000-4000-8000-000000000002";
const ADDRESS_ID = "30000000-0000-4000-8000-000000000001";
const SEEDED_ORDER_ID = "40000000-0000-4000-8000-000000000001";
const WEBHOOK_SECRET = "phase5-local-webhook-secret";

function assert(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`✓ ${message}`);
}

function localStatus() {
  const output = execFileSync("npx", ["--yes", "supabase@latest", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const status = JSON.parse(output);
  assert(status.API_URL?.startsWith("http://127.0.0.1:"), "validação limitada ao Supabase local");
  return status;
}

async function signedInClient(apiUrl, key) {
  const client = createClient(apiUrl, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("Sessão local não criada.");
  return { client, token: data.session.access_token, userId: data.user.id };
}

async function invoke(apiUrl, key, token, functionName, body) {
  const response = await fetch(`${apiUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "http://127.0.0.1:8080",
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function endpointAvailable(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/functions/v1/process-payment`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://127.0.0.1:8080" },
      body: "{}",
      signal: AbortSignal.timeout(1000),
    });
    return response.status === 401;
  } catch {
    return false;
  }
}

async function ensureFunctionsRunning(apiUrl) {
  if (await endpointAvailable(apiUrl)) return { stop() {} };
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "flor-artesanal-phase5-"));
  const envFile = join(temporaryDirectory, "functions.env");
  writeFileSync(envFile, [
    "APP_URL=http://127.0.0.1:8080",
    "MELHOR_ENVIO_ENV=sandbox",
    "MELHOR_ENVIO_CLIENT_ID=local-mock-client",
    "MELHOR_ENVIO_CLIENT_SECRET=local-mock-secret",
    "MELHOR_ENVIO_REDIRECT_URI=http://127.0.0.1:54321/functions/v1/melhor-envio-oauth",
    "MELHOR_ENVIO_USER_AGENT=Gostudumatu local-test contato@gostudumatu.com.br",
    "MELHOR_ENVIO_MOCK=true",
    "MERCADOPAGO_ACCESS_TOKEN=TEST-local-access-token",
    "MERCADOPAGO_PUBLIC_KEY=TEST-local-public-key",
    `MERCADOPAGO_WEBHOOK_SECRET=${WEBHOOK_SECRET}`,
    "MERCADOPAGO_ENV=test",
    "MERCADOPAGO_MOCK=true",
    "",
  ].join("\n"), { mode: 0o600 });

  const child = spawn("npx", ["--yes", "supabase@latest", "functions", "serve", "--env-file", envFile], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await endpointAvailable(apiUrl)) {
      return {
        stop() {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
          rmSync(temporaryDirectory, { recursive: true, force: true });
        },
      };
    }
    if (child.exitCode !== null) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      throw new Error(`Edge Functions não iniciaram. ${output.slice(-1200)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (child.pid) process.kill(-child.pid, "SIGTERM");
  rmSync(temporaryDirectory, { recursive: true, force: true });
  throw new Error(`Tempo esgotado ao iniciar Edge Functions. ${output.slice(-1200)}`);
}

async function quoteAndCheckout(apiUrl, key, token, productId, quantity) {
  const quote = await invoke(apiUrl, key, token, "shipping-quotes", {
    postalCode: "79240000",
    items: [{ productId, quantity }],
  });
  assert(quote.status === 200 && quote.payload.groups?.length === 1, "frete é calculado com preço vindo do backend");
  const selections = quote.payload.groups.map((group) => ({
    producerId: group.producerId,
    serviceId: group.options[0].serviceId,
  }));
  const checkout = await invoke(apiUrl, key, token, "checkout-session", {
    quoteSessionId: quote.payload.quoteSessionId,
    addressId: ADDRESS_ID,
    idempotencyKey: randomUUID(),
    selections,
  });
  assert(
    checkout.status === 200
      && checkout.payload.order?.status === "awaiting_payment"
      && checkout.payload.order.totalCents === checkout.payload.order.subtotalCents + checkout.payload.order.shippingCents,
    "checkout recota, calcula o total e reserva o estoque no servidor",
  );
  return checkout.payload;
}

async function sendWebhook(apiUrl, providerOrderId, eventId, mockStatus = "approved") {
  const requestId = randomUUID();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const manifest = `id:${providerOrderId};request-id:${requestId};ts:${timestamp};`;
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  const response = await fetch(
    `${apiUrl}/functions/v1/mercadopago-webhook?data.id=${encodeURIComponent(providerOrderId)}&mock_status=${mockStatus}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${timestamp},v1=${signature}`,
      },
      body: JSON.stringify({ id: eventId, type: "orders", data: { id: providerOrderId } }),
    },
  );
  return { status: response.status, payload: await response.json().catch(() => ({})) };
}

async function main() {
  const status = localStatus();
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  const runtime = await ensureFunctionsRunning(status.API_URL);

  try {
    const service = createClient(status.API_URL, serviceKey, { auth: { persistSession: false } });
    const customer = await signedInClient(status.API_URL, publicKey);

    const { data: generatedOrders } = await service
      .from("orders")
      .select("id")
      .eq("customer_id", customer.userId)
      .neq("id", SEEDED_ORDER_ID);
    if (generatedOrders?.length) {
      const orderIds = generatedOrders.map(({ id }) => id);
      const dependentTables = [
        "fulfillment_jobs",
        "refunds",
        "order_events",
        "inventory_reservations",
        "payment_attempts",
        "shipments",
        "order_items",
      ];
      for (const table of dependentTables) {
        const { error } = await service.from(table).delete().in("order_id", orderIds);
        if (error) throw error;
      }
      const { error: orderDeleteError } = await service.from("orders").delete().in("id", orderIds);
      if (orderDeleteError) throw orderDeleteError;
    }
    await service.from("webhook_events").delete().eq("provider", "mercado_pago");
    await service.from("shipping_quote_sessions").delete().eq("customer_id", customer.userId);
    const [{ error: stockAResetError }, { error: stockBResetError }] = await Promise.all([
      service.from("products").update({ stock_quantity: 5 }).eq("id", PRODUCT_A),
      service.from("products").update({ stock_quantity: 8 }).eq("id", PRODUCT_B),
    ]);
    if (stockAResetError || stockBResetError) throw stockAResetError ?? stockBResetError;

    const unauthorized = await invoke(status.API_URL, publicKey, publicKey, "checkout-session", {});
    assert(unauthorized.status === 401, "visitante não cria sessão de checkout");

    const firstCheckout = await quoteAndCheckout(status.API_URL, publicKey, customer.token, PRODUCT_A, 1);
    assert(firstCheckout.publicKey === "TEST-local-public-key", "frontend recebe somente a chave pública do Mercado Pago");
    const pixKey = randomUUID();
    const pix = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "create",
      method: "pix",
      orderId: firstCheckout.order.id,
      idempotencyKey: pixKey,
    });
    assert(
      pix.status === 200 && pix.payload.orderStatus === "awaiting_payment" && pix.payload.payment?.qrCode,
      "Pix cria QR Code e permanece aguardando confirmação",
    );
    const { data: pixAttempt } = await service
      .from("payment_attempts")
      .select("provider_response")
      .eq("id", pix.payload.paymentAttemptId)
      .single();
    assert(
      pixAttempt?.provider_response?.total_amount === "50.00",
      "Pix de teste usa a fixture oficial de R$ 50 do Mercado Pago",
    );
    const repeatedPix = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "create",
      method: "pix",
      orderId: firstCheckout.order.id,
      idempotencyKey: pixKey,
    });
    assert(
      repeatedPix.status === 200
        && repeatedPix.payload.paymentAttemptId === pix.payload.paymentAttemptId
        && repeatedPix.payload.payment.providerOrderId === pix.payload.payment.providerOrderId,
      "repetição idempotente não cria outro pagamento",
    );

    const invalidWebhook = await fetch(`${status.API_URL}/functions/v1/mercadopago-webhook?data.id=${pix.payload.payment.providerOrderId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: randomUUID(), type: "orders", data: { id: pix.payload.payment.providerOrderId } }),
    });
    assert(invalidWebhook.status === 401, "webhook sem assinatura válida é recusado");

    const webhookEventId = randomUUID();
    const webhook = await sendWebhook(status.API_URL, pix.payload.payment.providerOrderId, webhookEventId);
    assert(webhook.status === 200 && webhook.payload.outcome === "paid", "webhook assinado consulta e confirma o pagamento");
    const duplicateWebhook = await sendWebhook(status.API_URL, pix.payload.payment.providerOrderId, webhookEventId);
    assert(duplicateWebhook.status === 200 && duplicateWebhook.payload.duplicate === true, "webhook repetido é processado uma única vez");

    const [{ data: paidOrder }, { data: convertedReservations }, { data: fulfillmentJobs }, { data: productAfterPayment }] = await Promise.all([
      service.from("orders").select("status, paid_at").eq("id", firstCheckout.order.id).single(),
      service.from("inventory_reservations").select("status").eq("order_id", firstCheckout.order.id),
      service.from("fulfillment_jobs").select("id").eq("order_id", firstCheckout.order.id),
      service.from("products").select("stock_quantity").eq("id", PRODUCT_A).single(),
    ]);
    assert(paidOrder?.status === "paid" && Boolean(paidOrder.paid_at), "pedido recebe status pago e data de confirmação");
    assert(convertedReservations?.every(({ status: value }) => value === "converted"), "reserva paga é convertida em baixa de estoque");
    assert(productAfterPayment?.stock_quantity === 4, "estoque é baixado exatamente uma vez");
    assert(fulfillmentJobs?.length === 1, "pagamento confirmado enfileira a criação da etiqueta");

    const secondCheckout = await quoteAndCheckout(status.API_URL, publicKey, customer.token, PRODUCT_B, 1);
    const rejectedToken = `card_rejected_${randomUUID()}`;
    const rejectedCard = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "create",
      method: "card",
      orderId: secondCheckout.order.id,
      idempotencyKey: randomUUID(),
      card: {
        token: rejectedToken,
        paymentMethodId: "master",
        paymentTypeId: "credit_card",
        installments: 1,
      },
    });
    assert(rejectedCard.status === 200 && rejectedCard.payload.orderStatus === "payment_failed", "cartão recusado não converte a reserva");
    const { data: rejectedAttempt } = await service
      .from("payment_attempts")
      .select("provider_response")
      .eq("id", rejectedCard.payload.paymentAttemptId)
      .single();
    assert(!JSON.stringify(rejectedAttempt).includes(rejectedToken), "token do cartão nunca é persistido");

    const latePix = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "create",
      method: "pix",
      orderId: secondCheckout.order.id,
      idempotencyKey: randomUUID(),
    });
    assert(latePix.status === 200 && latePix.payload.orderStatus === "awaiting_payment", "cliente pode tentar Pix após recusa do cartão");
    await service.from("inventory_reservations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("order_id", secondCheckout.order.id);
    await service.rpc("expire_inventory_reservations");
    const expiredPayment = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "status",
      orderId: secondCheckout.order.id,
      paymentAttemptId: latePix.payload.paymentAttemptId,
      mockStatus: "pending",
    });
    assert(expiredPayment.status === 200 && expiredPayment.payload.orderStatus === "expired", "pagamento pendente não reabre uma reserva expirada");
    await service.from("products").update({ stock_quantity: 0 }).eq("id", PRODUCT_B);
    const lateApproval = await invoke(status.API_URL, publicKey, customer.token, "process-payment", {
      action: "status",
      orderId: secondCheckout.order.id,
      paymentAttemptId: latePix.payload.paymentAttemptId,
      mockStatus: "approved",
    });
    assert(lateApproval.status === 200 && lateApproval.payload.orderStatus === "refunded", "pagamento tardio sem estoque é estornado automaticamente");
    const { data: refund } = await service.from("refunds").select("status, provider_refund_id").eq("order_id", secondCheckout.order.id).single();
    assert(refund?.status === "approved" && Boolean(refund.provider_refund_id), "estorno automático fica registrado para auditoria");

    const { data: exposedAttempts, error: exposedError } = await customer.client.from("payment_attempts").select("provider_response");
    assert(Boolean(exposedError) || exposedAttempts?.length === 0, "cliente não lê respostas privadas do provedor diretamente");

    console.log("\nFase 5 validada localmente com Mercado Pago e Melhor Envio simulados; nenhuma API externa foi chamada.");
  } finally {
    runtime.stop();
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  process.exitCode = 1;
});
