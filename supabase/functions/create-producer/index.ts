import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, requireSuperAdmin } from "../_shared/supabase.ts";

type CreateProducerBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  location?: unknown;
  bio?: unknown;
};

function requiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function optionalText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 70);
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
      ? errorResponse("FORBIDDEN", "Apenas super administradores podem criar produtores.", 403, headers)
      : errorResponse("UNAUTHORIZED", "Sessão inválida ou expirada.", 401, headers);
  }

  let body: CreateProducerBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }

  const name = requiredText(body.name, 120);
  const email = requiredText(body.email, 254)?.toLowerCase();
  const password = requiredText(body.password, 128);
  const location = optionalText(body.location, 180);
  const bio = optionalText(body.bio, 3000);

  if (!name || !email || !email.includes("@") || !password || password.length < 8) {
    return errorResponse(
      "INVALID_INPUT",
      "Informe nome, e-mail válido e senha com pelo menos 8 caracteres.",
      422,
      headers,
    );
  }

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    return errorResponse(
      "AUTH_USER_CREATION_FAILED",
      authError?.message ?? "Não foi possível criar o acesso do produtor.",
      409,
      headers,
    );
  }

  const userId = authData.user.id;
  const baseSlug = slugify(name) || "produtor";
  const slug = `${baseSlug}-${userId.slice(0, 8)}`;

  const { data: producer, error: producerError } = await admin
    .from("producers")
    .insert({ name, slug, location, bio, user_id: userId })
    .select("id, name, slug, location, bio, image, user_id")
    .single();

  if (producerError || !producer) {
    await admin.auth.admin.deleteUser(userId);
    return errorResponse(
      "PRODUCER_CREATION_FAILED",
      producerError?.message ?? "Não foi possível criar o produtor.",
      409,
      headers,
    );
  }

  const { error: roleError } = await admin
    .from("user_roles")
    .insert({ user_id: userId, role: "producer" });

  if (roleError) {
    await admin.from("producers").delete().eq("id", producer.id);
    await admin.auth.admin.deleteUser(userId);
    return errorResponse("ROLE_CREATION_FAILED", "Não foi possível atribuir o perfil do produtor.", 500, headers);
  }

  return jsonResponse({ producer }, 201, headers);
});
