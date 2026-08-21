import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "TesteLocal123!";
const OWN_PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_PRODUCT_ID = "20000000-0000-4000-8000-000000000002";
const SHIPMENT_ID = "60000000-0000-4000-8000-000000000001";
const ORDER_ID = "40000000-0000-4000-8000-000000000001";

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

async function signedInClient(apiUrl, key, email) {
  const client = createClient(apiUrl, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`Sessão de ${email} não criada.`);
  return { client, token: data.session.access_token };
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
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { status: response.status, payload };
}

async function endpointAvailable(apiUrl) {
  try {
    const response = await fetch(`${apiUrl}/functions/v1/melhor-envio-oauth`, {
      signal: AbortSignal.timeout(1000),
    });
    if (response.status !== 400) return false;
    const payload = await response.json();
    return payload?.error?.code === "INVALID_OAUTH_STATE";
  } catch {
    return false;
  }
}

async function ensureFunctionsRunning(apiUrl) {
  if (await endpointAvailable(apiUrl)) return { stop() {} };

  const temporaryDirectory = mkdtempSync(join(tmpdir(), "flor-artesanal-phase4-"));
  const envFile = join(temporaryDirectory, "functions.env");
  writeFileSync(envFile, [
    "APP_URL=http://127.0.0.1:8080",
    "MELHOR_ENVIO_ENV=sandbox",
    "MELHOR_ENVIO_CLIENT_ID=local-mock-client",
    "MELHOR_ENVIO_CLIENT_SECRET=local-mock-secret",
    "MELHOR_ENVIO_REDIRECT_URI=http://127.0.0.1:54321/functions/v1/melhor-envio-oauth",
    "MELHOR_ENVIO_USER_AGENT=Gostudumatu local-test contato@gostudumatu.com.br",
    "MELHOR_ENVIO_MOCK=true",
    "",
  ].join("\n"), { mode: 0o600 });

  const child = spawn(
    "npx",
    ["--yes", "supabase@latest", "functions", "serve", "--env-file", envFile],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await endpointAvailable(apiUrl)) {
      return {
        stop() {
          child.kill("SIGTERM");
          rmSync(temporaryDirectory, { recursive: true, force: true });
        },
      };
    }
    if (child.exitCode !== null) {
      rmSync(temporaryDirectory, { recursive: true, force: true });
      throw new Error(`Edge Functions não iniciaram. ${output.slice(-1000)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill("SIGTERM");
  rmSync(temporaryDirectory, { recursive: true, force: true });
  throw new Error(`Tempo esgotado ao iniciar Edge Functions. ${output.slice(-1000)}`);
}

async function main() {
  const status = localStatus();
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  const serviceRoleJwt = status.SERVICE_ROLE_KEY || serviceKey;
  const runtime = await ensureFunctionsRunning(status.API_URL);

  try {
    const service = createClient(status.API_URL, serviceKey, { auth: { persistSession: false } });
    const anonymous = createClient(status.API_URL, publicKey, { auth: { persistSession: false } });
    const admin = await signedInClient(status.API_URL, publicKey, "admin@local.test");
    const customer = await signedInClient(status.API_URL, publicKey, "cliente@local.test");
    const producer = await signedInClient(status.API_URL, publicKey, "produtor@local.test");

    const fakeAccessToken = `local-access-${crypto.randomUUID()}`;
    const fakeRefreshToken = `local-refresh-${crypto.randomUUID()}`;
    const { error: tokenStoreError } = await service.rpc("store_melhor_envio_oauth_tokens", {
      access_token: fakeAccessToken,
      refresh_token: fakeRefreshToken,
      access_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      refresh_expires_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      token_type: "Bearer",
      granted_scope: "shipping-calculate shipping-checkout",
      connected_by: null,
    });
    assert(!tokenStoreError, "tokens rotativos são armazenados pelo backend no Vault");

    const { data: storedTokens, error: storedTokenError } = await service.rpc("get_melhor_envio_oauth_tokens");
    assert(
      !storedTokenError && storedTokens?.[0]?.access_token === fakeAccessToken
        && storedTokens[0].refresh_token === fakeRefreshToken,
      "service_role recupera os tokens criptografados para chamadas server-side",
    );
    const { error: anonymousTokenError } = await anonymous.rpc("get_melhor_envio_oauth_tokens");
    assert(Boolean(anonymousTokenError), "cliente anônimo não acessa tokens do Vault");

    const statusResponse = await invoke(status.API_URL, publicKey, admin.token, "melhor-envio-oauth", { action: "status" });
    assert(
      statusResponse.status === 200 && statusResponse.payload.connected === true && statusResponse.payload.mock === true,
      "super admin consulta apenas metadados da conexão OAuth em modo mock",
    );
    const serializedStatus = JSON.stringify(statusResponse.payload);
    assert(
      !serializedStatus.includes(fakeAccessToken) && !serializedStatus.includes(fakeRefreshToken),
      "status OAuth não devolve Access Token nem Refresh Token ao navegador",
    );
    assert(
      statusResponse.payload.callbackUrl === "http://127.0.0.1:54321/functions/v1/melhor-envio-oauth",
      "callback OAuth local corresponde à Edge Function implementada",
    );

    const authorization = await invoke(status.API_URL, publicKey, admin.token, "melhor-envio-oauth", { action: "authorize" });
    assert(
      authorization.status === 200
        && authorization.payload.authorizationUrl.startsWith("https://sandbox.melhorenvio.com.br/oauth/authorize?")
        && authorization.payload.authorizationUrl.includes("state="),
      "autorização OAuth gera URL sandbox com state de uso único",
    );
    const forbiddenAuthorization = await invoke(status.API_URL, publicKey, producer.token, "melhor-envio-oauth", { action: "authorize" });
    assert(forbiddenAuthorization.status === 403, "produtor não altera a conexão OAuth global");

    const quote = await invoke(status.API_URL, publicKey, customer.token, "shipping-quotes", {
      postalCode: "79002-000",
      items: [
        { productId: OWN_PRODUCT_ID, quantity: 1 },
        { productId: OTHER_PRODUCT_ID, quantity: 2 },
      ],
    });
    assert(quote.status === 200 && quote.payload.groups?.length === 2, "carrinho é separado em uma cotação por produtor");
    assert(
      quote.payload.groups.every((group) => group.options.length === 2 && group.options[0].priceCents > 0),
      "cada origem recebe opções e preço próprios",
    );
    const serializedQuote = JSON.stringify(quote.payload);
    assert(
      !serializedQuote.includes("Rua de Teste")
        && !serializedQuote.includes("Avenida Local")
        && !serializedQuote.includes("12345678909")
        && !serializedQuote.includes(fakeAccessToken),
      "cotação não expõe endereço de origem, documento ou token",
    );

    const selections = quote.payload.groups.map((group) => ({
      producerId: group.producerId,
      serviceId: group.options[0].serviceId,
    }));
    const requote = await invoke(status.API_URL, publicKey, customer.token, "shipping-quotes", {
      action: "requote",
      quoteSessionId: quote.payload.quoteSessionId,
      selections,
    });
    assert(requote.status === 200 && requote.payload.confirmed === true, "backend recota e confirma escolhas sem mudança de preço");

    const { data: storedQuote, error: storedQuoteError } = await service
      .from("shipping_quote_sessions")
      .select("quotes_snapshot")
      .eq("id", requote.payload.quote.quoteSessionId)
      .single();
    if (storedQuoteError || !storedQuote) throw storedQuoteError ?? new Error("Cotação de teste não encontrada.");
    const changedSnapshot = structuredClone(storedQuote.quotes_snapshot);
    changedSnapshot[0].options[0].priceCents += 1;
    const { error: changeQuoteError } = await service
      .from("shipping_quote_sessions")
      .update({ quotes_snapshot: changedSnapshot })
      .eq("id", requote.payload.quote.quoteSessionId);
    if (changeQuoteError) throw changeQuoteError;
    const changedQuote = await invoke(status.API_URL, publicKey, customer.token, "shipping-quotes", {
      action: "requote",
      quoteSessionId: requote.payload.quote.quoteSessionId,
      selections,
    });
    assert(
      changedQuote.status === 409 && changedQuote.payload.error?.code === "QUOTE_CHANGED" && changedQuote.payload.quote,
      "mudança de preço retorna QUOTE_CHANGED com uma nova cotação",
    );

    const { data: customerUser } = await customer.client.auth.getUser();
    const { data: hiddenQuotes, error: hiddenQuoteError } = await customer.client
      .from("shipping_quote_sessions")
      .select("id")
      .eq("customer_id", customerUser.user.id);
    assert(Boolean(hiddenQuoteError) || !hiddenQuotes?.length, "snapshots privados da cotação não são lidos diretamente pelo cliente");

    const ownGroup = requote.payload.quote.groups.find((group) => group.producerId === "10000000-0000-4000-8000-000000000001");
    const selectedService = ownGroup.options[0];
    const { error: resetShipmentError } = await service.from("shipments").update({
      status: "pending",
      quote_session_id: null,
      service_id: null,
      quoted_at: null,
      package_snapshot: {},
      shipping_amount_cents: 0,
      carrier: null,
      service_name: null,
      external_shipment_id: null,
      tracking_code: null,
      label_url: null,
      label_error: null,
      provider_metadata: {},
    }).eq("id", SHIPMENT_ID);
    if (resetShipmentError) throw resetShipmentError;

    const label = await invoke(status.API_URL, publicKey, admin.token, "fulfillment-worker", {
      action: "run",
      shipmentId: SHIPMENT_ID,
      quoteSessionId: requote.payload.quote.quoteSessionId,
      serviceId: selectedService.serviceId,
    });
    assert(
      label.status === 200 && label.payload.shipment.status === "label_created" && label.payload.shipment.labelUrl,
      "sandbox mock simula carrinho, compra, geração e impressão da etiqueta",
    );

    const repeatedLabel = await invoke(status.API_URL, publicKey, admin.token, "fulfillment-worker", {
      action: "run",
      shipmentId: SHIPMENT_ID,
      quoteSessionId: requote.payload.quote.quoteSessionId,
      serviceId: selectedService.serviceId,
    });
    assert(
      repeatedLabel.status === 200
        && repeatedLabel.payload.shipment.externalShipmentId === label.payload.shipment.externalShipmentId,
      "repetição do processamento não compra outra etiqueta",
    );

    const internalTracking = await invoke(status.API_URL, publicKey, serviceRoleJwt, "fulfillment-worker", {
      action: "track",
      shipmentId: SHIPMENT_ID,
    });
    assert(internalTracking.status === 200, "backend interno pode acionar o worker após a confirmação do pagamento");

    const { data: events, error: eventError } = await service
      .from("order_events")
      .select("event_type")
      .eq("order_id", ORDER_ID)
      .like("event_type", "shipping_%");
    assert(!eventError && events?.some((event) => event.event_type === "shipping_label_printed"), "ciclo da etiqueta deixa trilha de auditoria");

    const anonymousQuote = await invoke(status.API_URL, publicKey, publicKey, "shipping-quotes", {
      postalCode: "79002000",
      items: [{ productId: OWN_PRODUCT_ID, quantity: 1 }],
    });
    assert(anonymousQuote.status === 401, "visitante sem sessão não calcula frete");

    console.log("\nFase 4 validada localmente com respostas mock; nenhuma API externa foi chamada.");
  } finally {
    runtime.stop();
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  process.exitCode = 1;
});
