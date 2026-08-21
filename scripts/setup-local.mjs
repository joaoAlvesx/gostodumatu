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
  await ensureUser(admin, CUSTOMER_EMAIL, TEST_PASSWORD);

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
