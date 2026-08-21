import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "TesteLocal123!";
const PRODUCT_ID = "20000000-0000-4000-8000-000000000001";

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

async function waitForLocalEmail(mailpitUrl, recipient) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`);
    if (!response.ok) throw new Error("Mailpit local indisponível.");
    const payload = await response.json();
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    if (messages.some((message) => JSON.stringify(message).includes(recipient))) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function main() {
  const status = localStatus();
  const publicKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
  const service = createClient(status.API_URL, serviceKey, { auth: { persistSession: false } });
  const anonymous = createClient(status.API_URL, publicKey, { auth: { persistSession: false } });
  const customer = await authenticatedClient(status.API_URL, publicKey, "cliente@local.test");
  const admin = await authenticatedClient(status.API_URL, publicKey, "admin@local.test");
  const customerUser = (await customer.auth.getUser()).data.user;
  const adminUser = (await admin.auth.getUser()).data.user;
  if (!customerUser || !adminUser) throw new Error("Usuários locais não encontrados. Execute npm run local:setup.");

  const signupEmail = `fase3-${crypto.randomUUID()}@local.test`;
  const { data: signupData, error: signupError } = await anonymous.auth.signUp({
    email: signupEmail,
    password: PASSWORD,
    options: {
      data: { full_name: "Novo Cliente Local" },
      emailRedirectTo: "http://127.0.0.1:8080/auth/callback?next=/minha-conta",
    },
  });
  assert(
    !signupError && Boolean(signupData.user) && signupData.session === null,
    "cadastro por e-mail exige confirmação antes de criar a sessão",
  );
  const confirmationDelivered = await waitForLocalEmail(status.MAILPIT_URL, signupEmail);
  assert(confirmationDelivered, "confirmação de cadastro chega ao Mailpit local");
  if (signupData.user) await service.auth.admin.deleteUser(signupData.user.id);

  const recoveryEmail = `recuperacao-${crypto.randomUUID()}@local.test`;
  const { data: recoveryUserData, error: recoveryUserError } = await service.auth.admin.createUser({
    email: recoveryEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (recoveryUserError || !recoveryUserData.user) {
    throw recoveryUserError ?? new Error("Usuário de recuperação não foi criado.");
  }
  const { error: recoveryError } = await anonymous.auth.resetPasswordForEmail(
    recoveryEmail,
    { redirectTo: "http://127.0.0.1:8080/auth/callback?next=/atualizar-senha" },
  );
  assert(!recoveryError, "recuperação de senha aceita a callback da aplicação");
  const recoveryDelivered = await waitForLocalEmail(status.MAILPIT_URL, recoveryEmail);
  assert(recoveryDelivered, "recuperação de senha chega ao Mailpit local");
  await service.auth.admin.deleteUser(recoveryUserData.user.id);

  const { data: ownProfiles, error: profileError } = await customer
    .from("customer_profiles")
    .select("id, email");
  assert(
    !profileError && ownProfiles?.length === 1 && ownProfiles[0].id === customerUser.id,
    "cliente autenticado lê somente o próprio perfil",
  );

  const phaseAddressLabel = `Fase 3 ${crypto.randomUUID()}`;
  const { data: address, error: addressError } = await customer
    .from("customer_addresses")
    .insert({
      customer_id: customerUser.id,
      label: phaseAddressLabel,
      recipient_name: "Cliente da Fase 3",
      recipient_phone: "67966666666",
      postal_code: "79240000",
      street: "Rua da Fase 3",
      number: "30",
      neighborhood: "Centro",
      city: "Jardim",
      state: "MS",
    })
    .select("id")
    .single();
  assert(!addressError && Boolean(address?.id), "cliente cadastra um endereço próprio");

  const { error: foreignAddressError } = await customer.from("customer_addresses").insert({
    customer_id: adminUser.id,
    label: "Bloqueado",
    recipient_name: "Tentativa indevida",
    postal_code: "79240000",
    street: "Rua Bloqueada",
    number: "1",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
  });
  assert(Boolean(foreignAddressError), "cliente não grava endereço em outra conta");

  const ownOrderIdempotencyKey = `phase3-own-${crypto.randomUUID()}`;
  const otherOrderIdempotencyKey = `phase3-other-${crypto.randomUUID()}`;
  const orderBase = {
    status: "awaiting_payment",
    subtotal_amount_cents: 2500,
    shipping_amount_cents: 1000,
    discount_amount_cents: 0,
    total_amount_cents: 3500,
    customer_snapshot: { name: "Cliente local", email: customerUser.email },
    shipping_address_snapshot: {
      recipient_name: "Cliente local",
      postal_code: "79240000",
      street: "Rua Local",
      number: "10",
      neighborhood: "Centro",
      city: "Jardim",
      state: "MS",
    },
  };
  const { data: createdOrders, error: createOrdersError } = await service
    .from("orders")
    .insert([
      { ...orderBase, customer_id: customerUser.id, idempotency_key: ownOrderIdempotencyKey },
      { ...orderBase, customer_id: adminUser.id, idempotency_key: otherOrderIdempotencyKey },
    ])
    .select("id, customer_id");
  if (createOrdersError || !createdOrders || createdOrders.length !== 2) {
    throw createOrdersError ?? new Error("Pedidos de validação não foram criados.");
  }
  const ownOrder = createdOrders.find((order) => order.customer_id === customerUser.id);
  const otherOrder = createdOrders.find((order) => order.customer_id === adminUser.id);
  if (!ownOrder || !otherOrder) throw new Error("Pedidos de validação incompletos.");

  try {
    const { error: itemError } = await service.from("order_items").insert([
      {
        order_id: ownOrder.id,
        product_id: PRODUCT_ID,
        producer_id: "10000000-0000-4000-8000-000000000001",
        product_name: "Produto do cliente",
        product_snapshot: { name: "Produto do cliente" },
        unit_price_cents: 2500,
        quantity: 1,
      },
      {
        order_id: otherOrder.id,
        product_id: PRODUCT_ID,
        producer_id: "10000000-0000-4000-8000-000000000001",
        product_name: "Produto de outro cliente",
        product_snapshot: { name: "Produto de outro cliente" },
        unit_price_cents: 2500,
        quantity: 1,
      },
    ]);
    if (itemError) throw itemError;

    const orderIds = [ownOrder.id, otherOrder.id];
    const [{ data: visibleOrders }, { data: visibleItems }, { data: anonymousOrders }] = await Promise.all([
      customer.from("orders").select("id").in("id", orderIds),
      customer.from("order_items").select("order_id").in("order_id", orderIds),
      anonymous.from("orders").select("id").in("id", orderIds),
    ]);
    assert(
      visibleOrders?.length === 1 && visibleOrders[0].id === ownOrder.id,
      "cliente visualiza somente o próprio pedido",
    );
    assert(
      visibleItems?.length === 1 && visibleItems[0].order_id === ownOrder.id,
      "cliente visualiza somente os itens do próprio pedido",
    );
    assert(!anonymousOrders || anonymousOrders.length === 0, "visitante não acessa pedidos");

    const { error: orderUpdateError } = await customer
      .from("orders")
      .update({ status: "paid" })
      .eq("id", ownOrder.id);
    assert(Boolean(orderUpdateError), "cliente não altera o estado do pedido diretamente");
  } finally {
    await service.from("orders").delete().in("id", [ownOrder.id, otherOrder.id]);
    if (address?.id) await service.from("customer_addresses").delete().eq("id", address.id);
  }

  console.log("\nFase 3 validada no Supabase local. Google e SMTP devem ser testados no navegador.");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : JSON.stringify(error)}`);
  process.exitCode = 1;
});
