import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PASSWORD = "TesteLocal123!";
const OWN_PRODUCER_ID = "10000000-0000-4000-8000-000000000001";
const OWN_PRODUCT_ID = "20000000-0000-4000-8000-000000000001";
const OTHER_PRODUCT_ID = "20000000-0000-4000-8000-000000000002";
const MIGRATION_PRODUCT_ID = "20000000-0000-4000-8000-000000000003";
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

  const { data: catalog, error: catalogError } = await anonymous.from("products").select("id");
  assert(!catalogError && (catalog?.length ?? 0) >= 2, "catálogo possui leitura pública");

  const { data: adminRole, error: adminRoleError } = await admin.rpc("has_role", { required_role: "super_admin" });
  assert(!adminRoleError && adminRole === true, "super admin vem da tabela protegida user_roles");
  const { data: producerRole } = await producer.rpc("has_role", { required_role: "super_admin" });
  assert(producerRole === false, "produtor não recebe privilégios administrativos");

  const { error: selfPromotionError } = await producer
    .from("user_roles")
    .insert({ user_id: (await producer.auth.getUser()).data.user.id, role: "super_admin" });
  assert(Boolean(selfPromotionError), "produtor não consegue promover a própria conta");

  const { data: ownProducer } = await producer
    .from("producers")
    .select("id")
    .eq("user_id", (await producer.auth.getUser()).data.user.id)
    .single();
  assert(ownProducer?.id === OWN_PRODUCER_ID, "produtor encontra apenas seu vínculo operacional");

  const { error: ownStoreUpdateError } = await producer
    .from("producers")
    .update({ bio: "alteração autorizada na loja" })
    .eq("id", OWN_PRODUCER_ID);
  const { data: ownStore } = await service
    .from("producers")
    .select("bio")
    .eq("id", OWN_PRODUCER_ID)
    .single();
  assert(
    !ownStoreUpdateError && ownStore?.bio === "alteração autorizada na loja",
    "produtor altera os dados da própria loja",
  );

  const { error: anonymousWriteError } = await anonymous.from("products").insert({
    name: "Tentativa anônima",
    price: 1,
    image: ["/placeholder.svg"],
    category: "Bloqueado",
    producer_id: OWN_PRODUCER_ID,
  });
  assert(Boolean(anonymousWriteError), "usuário anônimo não grava no catálogo");

  const { error: ownUpdateError } = await producer
    .from("products")
    .update({ description: "alteração autorizada" })
    .eq("id", OWN_PRODUCT_ID);
  const { data: ownProduct } = await service
    .from("products")
    .select("description")
    .eq("id", OWN_PRODUCT_ID)
    .single();
  assert(!ownUpdateError && ownProduct?.description === "alteração autorizada", "produtor altera o próprio produto");

  await producer.from("products").update({ description: "tentativa indevida" }).eq("id", OTHER_PRODUCT_ID);
  const { data: protectedProduct, error: protectedReadError } = await service
    .from("products")
    .select("description")
    .eq("id", OTHER_PRODUCT_ID)
    .single();
  assert(!protectedReadError && protectedProduct.description !== "tentativa indevida", "RLS bloqueia alteração de produto alheio");

  const ownPath = `producers/${OWN_PRODUCER_ID}/validation-${crypto.randomUUID()}.webp`;
  const { error: ownUploadError } = await producer.storage
    .from("catalog-images")
    .upload(ownPath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
  assert(!ownUploadError, "produtor envia imagem somente para sua pasta");

  const forbiddenPath = `producers/10000000-0000-4000-8000-000000000002/validation-${crypto.randomUUID()}.webp`;
  const { error: forbiddenUploadError } = await producer.storage
    .from("catalog-images")
    .upload(forbiddenPath, new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" }));
  assert(Boolean(forbiddenUploadError), "Storage bloqueia upload na pasta de outro produtor");
  await producer.storage.from("catalog-images").remove([ownPath]);

  const { data: functionData, error: functionError } = await admin.functions.invoke("create-producer", {
    body: {
      name: "Criado pela Edge Function",
      email: `edge-${Date.now()}@local.test`,
      password: PASSWORD,
      location: "Jardim/MS",
      bio: "Teste automatizado local",
    },
  });
  assert(!functionError && Boolean(functionData?.producer?.id), "criação de produtor ocorre na Edge Function administrativa");

  const { error: legacyInsertError } = await service.from("products").upsert({
    id: MIGRATION_PRODUCT_ID,
    name: "Imagem legada para migração",
    price: 1,
    image: [TINY_PNG],
    category: "Teste local",
    producer_id: OWN_PRODUCER_ID,
  });
  if (legacyInsertError) throw legacyInsertError;

  const { data: migrationData, error: migrationError } = await admin.functions.invoke("migrate-catalog-images", {
    body: { dryRun: false, limit: 500 },
  });
  assert(!migrationError && migrationData?.migratedImages >= 1, "migração move imagens Base64 para o Storage");

  const { data: migratedProduct, error: migratedReadError } = await service
    .from("products")
    .select("image")
    .eq("id", MIGRATION_PRODUCT_ID)
    .single();
  assert(
    !migratedReadError && migratedProduct.image.every((url) => !url.startsWith("data:image/") && url.includes("/storage/v1/object/public/catalog-images/")),
    "banco mantém somente URLs após a migração",
  );

  const migratedPathMarker = "/storage/v1/object/public/catalog-images/";
  const migratedPath = decodeURIComponent(migratedProduct.image[0].split(migratedPathMarker)[1]);
  const { error: migratedDeleteError } = await producer.storage.from("catalog-images").remove([migratedPath]);
  assert(!migratedDeleteError, "produtor administra a imagem legada migrada para sua pasta");

  const { data: products, error: productsError } = await service.from("products").select("image");
  assert(
    !productsError && !(products ?? []).some((item) => item.image.some((url) => url.startsWith("data:image/"))),
    "catálogo local não mantém Base64 no banco",
  );

  console.log("\nFase 1 validada no ambiente local.");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
