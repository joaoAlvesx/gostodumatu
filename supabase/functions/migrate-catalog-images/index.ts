import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, requireSuperAdmin } from "../_shared/supabase.ts";

const BUCKET = "catalog-images";
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp|avif));base64,([A-Za-z0-9+/=\s]+)$/;

type MigrationBody = { dryRun?: unknown; limit?: unknown };
type MigrationFailure = { entity: "product" | "producer"; id: string; reason: string };

function decodeImage(dataUrl: string): { bytes: Uint8Array; mimeType: string; extension: string } | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) return null;

  const mimeType = match[1];
  const binary = atob(match[2].replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  return { bytes, mimeType, extension };
}

function imageList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" && value ? [value] : [];
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (!headers) return errorResponse("ORIGIN_NOT_ALLOWED", "Origem não autorizada.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Método não permitido.", 405, headers);
  }

  try {
    await requireSuperAdmin(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNAUTHORIZED";
    return code === "FORBIDDEN"
      ? errorResponse("FORBIDDEN", "Apenas super administradores podem executar a migração.", 403, headers)
      : errorResponse("UNAUTHORIZED", "Sessão inválida ou expirada.", 401, headers);
  }

  let body: MigrationBody = {};
  try {
    body = await request.json();
  } catch {
    // Corpo vazio usa dry-run por segurança.
  }

  const dryRun = body.dryRun !== false;
  const requestedLimit = typeof body.limit === "number" ? Math.floor(body.limit) : 100;
  const limit = Math.max(1, Math.min(requestedLimit, 500));
  const admin = createAdminClient();
  const [{ data: products, error: productsError }, { data: producers, error: producersError }] = await Promise.all([
    admin.from("products").select("id, image, producer_id").limit(limit),
    admin.from("producers").select("id, image").limit(limit),
  ]);

  if (productsError || producersError) {
    return errorResponse("CATALOG_READ_FAILED", "Não foi possível ler o catálogo.", 500, headers);
  }

  let migratedImages = 0;
  let affectedRecords = 0;
  const failures: MigrationFailure[] = [];

  for (const product of products ?? []) {
    const currentImages = imageList(product.image);
    if (!currentImages.some((image) => image.startsWith("data:image/"))) continue;
    affectedRecords += 1;
    if (dryRun) {
      migratedImages += currentImages.filter((image) => image.startsWith("data:image/")).length;
      continue;
    }

    try {
      const migrated = await Promise.all(currentImages.map(async (image, index) => {
        const decoded = decodeImage(image);
        if (!decoded) return image;
        if (decoded.bytes.byteLength > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB");
        const ownerFolder = product.producer_id ?? "admin";
        const path = `products/${ownerFolder}/${product.id}/migrated-${index}.${decoded.extension}`;
        const { error } = await admin.storage.from(BUCKET).upload(path, decoded.bytes, {
          contentType: decoded.mimeType,
          cacheControl: "31536000",
          upsert: true,
        });
        if (error) throw error;
        migratedImages += 1;
        return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }));

      const { error } = await admin.from("products").update({ image: migrated }).eq("id", product.id);
      if (error) throw error;
    } catch (error) {
      failures.push({ entity: "product", id: product.id, reason: error instanceof Error ? error.message : "Falha desconhecida" });
    }
  }

  for (const producer of producers ?? []) {
    if (typeof producer.image !== "string" || !producer.image.startsWith("data:image/")) continue;
    affectedRecords += 1;
    if (dryRun) {
      migratedImages += 1;
      continue;
    }

    try {
      const decoded = decodeImage(producer.image);
      if (!decoded) throw new Error("Data URL inválida");
      if (decoded.bytes.byteLength > 5 * 1024 * 1024) throw new Error("Imagem maior que 5 MB");
      const path = `producers/${producer.id}/migrated.${decoded.extension}`;
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, decoded.bytes, {
        contentType: decoded.mimeType,
        cacheControl: "31536000",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const publicUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await admin.from("producers").update({ image: publicUrl }).eq("id", producer.id);
      if (updateError) throw updateError;
      migratedImages += 1;
    } catch (error) {
      failures.push({ entity: "producer", id: producer.id, reason: error instanceof Error ? error.message : "Falha desconhecida" });
    }
  }

  return jsonResponse({ dryRun, affectedRecords, migratedImages, failures }, failures.length ? 207 : 200, headers);
});
