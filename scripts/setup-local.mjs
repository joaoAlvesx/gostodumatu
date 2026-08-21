import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "admin@local.test";
const PRODUCER_EMAIL = "produtor@local.test";
const CUSTOMER_EMAIL = "cliente@local.test";
const TEST_PASSWORD = "TesteLocal123!";
const OWN_PRODUCER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PRODUCER_ID = "10000000-0000-4000-8000-000000000002";
const OWN_PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_PRODUCT_ID = "20000000-0000-4000-8000-000000000002";
const CUSTOMER_ADDRESS_ID = "30000000-0000-4000-8000-000000000001";
const CUSTOMER_ORDER_ID = "40000000-0000-4000-8000-000000000001";
const CUSTOMER_ORDER_ITEM_ID = "50000000-0000-4000-8000-000000000001";
const CUSTOMER_SHIPMENT_ID = "60000000-0000-4000-8000-000000000001";

function localStatus() {
  const output = execFileSync(
    "npx",
    ["--yes", "supabase@latest", "status", "-o", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  const status = JSON.parse(output);
  if (!status.API_URL?.startsWith("http://127.0.0.1:")) {
    throw new Error("Proteção acionada: o Supabase informado não é local.");
  }
  return status;
}

async function ensureUser(admin, email, password) {
  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const existing = usersData.users.find((user) => user.email === email);
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Falha ao criar ${email}`);
  return data.user;
}

async function main() {
  const status = localStatus();
  const publishableKey = status.PUBLISHABLE_KEY || status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  if (!publishableKey || !serviceRoleKey) throw new Error("Chaves locais não encontradas.");

  writeFileSync(
    ".env.local",
    [
      `VITE_SUPABASE_URL=${status.API_URL}`,
      `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );

  const admin = createClient(status.API_URL, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminUser = await ensureUser(admin, ADMIN_EMAIL, TEST_PASSWORD);
  const producerUser = await ensureUser(admin, PRODUCER_EMAIL, TEST_PASSWORD);
  const customerUser = await ensureUser(admin, CUSTOMER_EMAIL, TEST_PASSWORD);

  const { error: roleError } = await admin.from("user_roles").upsert([
    { user_id: adminUser.id, role: "super_admin" },
    { user_id: producerUser.id, role: "producer" },
  ]);
  if (roleError) throw roleError;

  const { error: producerError } = await admin.from("producers").upsert([
    {
      id: OWN_PRODUCER_ID,
      name: "Produtor de Teste",
      slug: "produtor-de-teste",
      bio: "Cadastro local usado para validar permissões e uploads.",
      location: "Jardim/MS",
      image: "/placeholder.svg",
      user_id: producerUser.id,
    },
    {
      id: OTHER_PRODUCER_ID,
      name: "Outro Produtor",
      slug: "outro-produtor",
      bio: "Registro local usado no teste de isolamento entre produtores.",
      location: "Jardim/MS",
      image: "/placeholder.svg",
      user_id: null,
    },
  ]);
  if (producerError) throw producerError;

  const { error: productError } = await admin.from("products").upsert([
    {
      id: OWN_PRODUCT_ID,
      name: "Produto do usuário de teste",
      price: 25,
      image: ["/placeholder.svg"],
      category: "Teste local",
      description: "Pode ser alterado pelo produtor@local.test.",
      producer_id: OWN_PRODUCER_ID,
      stock_quantity: 5,
      weight_grams: 500,
      height_cm: 10,
      width_cm: 15,
      length_cm: 20,
      checkout_status: "available",
    },
    {
      id: OTHER_PRODUCT_ID,
      name: "Produto de outro produtor",
      price: 30,
      image: ["/placeholder.svg"],
      category: "Teste local",
      description: "Deve permanecer protegido contra o outro produtor.",
      producer_id: OTHER_PRODUCER_ID,
      stock_quantity: 8,
      weight_grams: 750,
      height_cm: 12,
      width_cm: 18,
      length_cm: 24,
      checkout_status: "available",
    },
  ]);
  if (productError) throw productError;

  const { error: fulfillmentError } = await admin.from("producer_fulfillment_profiles").upsert([
    {
      producer_id: OWN_PRODUCER_ID,
      contact_name: "Produtor de Teste",
      contact_email: PRODUCER_EMAIL,
      contact_phone: "67999999999",
      tax_id: "12345678909",
      origin_postal_code: "79240000",
      origin_street: "Rua de Teste",
      origin_number: "100",
      origin_neighborhood: "Centro",
      origin_city: "Jardim",
      origin_state: "MS",
      special_instructions: "Dados fictícios exclusivos do ambiente local.",
    },
    {
      producer_id: OTHER_PRODUCER_ID,
      contact_name: "Outro Produtor",
      contact_phone: "67988888888",
      origin_postal_code: "79240000",
      origin_street: "Avenida Local",
      origin_number: "200",
      origin_neighborhood: "Centro",
      origin_city: "Jardim",
      origin_state: "MS",
      special_instructions: "Dados fictícios exclusivos do ambiente local.",
    },
  ]);
  if (fulfillmentError) throw fulfillmentError;

  const { error: customerProfileError } = await admin.from("customer_profiles").update({
    full_name: "Cliente de Teste",
    email: CUSTOMER_EMAIL,
    phone: "67977777777",
    tax_id: "98765432100",
  }).eq("id", customerUser.id);
  if (customerProfileError) throw customerProfileError;

  const { error: clearDefaultAddressError } = await admin
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("customer_id", customerUser.id);
  if (clearDefaultAddressError) throw clearDefaultAddressError;

  const { error: customerAddressError } = await admin.from("customer_addresses").upsert({
    id: CUSTOMER_ADDRESS_ID,
    customer_id: customerUser.id,
    label: "Casa",
    recipient_name: "Cliente de Teste",
    recipient_phone: "67977777777",
    postal_code: "79240000",
    street: "Rua do Cliente",
    number: "10",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
    is_default: true,
  });
  if (customerAddressError) throw customerAddressError;

  const shippingAddressSnapshot = {
    recipient_name: "Cliente de Teste",
    recipient_phone: "67977777777",
    postal_code: "79240000",
    street: "Rua do Cliente",
    number: "10",
    neighborhood: "Centro",
    city: "Jardim",
    state: "MS",
  };
  const { error: customerOrderError } = await admin.from("orders").upsert({
    id: CUSTOMER_ORDER_ID,
    customer_id: customerUser.id,
    status: "paid",
    subtotal_amount_cents: 2500,
    shipping_amount_cents: 1000,
    discount_amount_cents: 0,
    total_amount_cents: 3500,
    customer_snapshot: {
      id: customerUser.id,
      name: "Cliente de Teste",
      email: CUSTOMER_EMAIL,
      phone: "67977777777",
      tax_id: "98765432100",
    },
    shipping_address_snapshot: shippingAddressSnapshot,
    idempotency_key: "local-customer-demo-order",
  });
  if (customerOrderError) throw customerOrderError;

  const { error: customerOrderItemError } = await admin.from("order_items").upsert({
    id: CUSTOMER_ORDER_ITEM_ID,
    order_id: CUSTOMER_ORDER_ID,
    product_id: OWN_PRODUCT_ID,
    producer_id: OWN_PRODUCER_ID,
    product_name: "Produto do usuário de teste",
    product_snapshot: {
      name: "Produto do usuário de teste",
      category: "Teste local",
      image: ["/placeholder.svg"],
      weight_grams: 500,
      height_cm: 10,
      width_cm: 15,
      length_cm: 20,
    },
    unit_price_cents: 2500,
    quantity: 1,
  });
  if (customerOrderItemError) throw customerOrderItemError;

  const { error: customerShipmentError } = await admin.from("shipments").upsert({
    id: CUSTOMER_SHIPMENT_ID,
    order_id: CUSTOMER_ORDER_ID,
    producer_id: OWN_PRODUCER_ID,
    status: "pending",
    origin_address_snapshot: {
      postal_code: "79240000",
      street: "Rua de Teste",
      number: "100",
      neighborhood: "Centro",
      city: "Jardim",
      state: "MS",
      contact_name: "Produtor de Teste",
      contact_phone: "67999999999",
    },
    destination_address_snapshot: shippingAddressSnapshot,
    package_snapshot: {},
    shipping_amount_cents: 0,
    provider_metadata: {},
  });
  if (customerShipmentError) throw customerShipmentError;

  console.log("Ambiente local preparado.");
  console.log(`Admin: ${ADMIN_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`Produtor: ${PRODUCER_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`Cliente: ${CUSTOMER_EMAIL} / ${TEST_PASSWORD}`);
  console.log(`Studio: ${status.STUDIO_URL}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
