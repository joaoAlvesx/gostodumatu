import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  exchangeMelhorEnvioCode,
  getMelhorEnvioAccessToken,
  melhorEnvioAuthorizationUrl,
  melhorEnvioConfig,
  melhorEnvioPublicError,
} from "../_shared/melhor-envio.ts";
import { createAdminClient, requireSuperAdmin } from "../_shared/supabase.ts";

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function callbackRedirect(result: "connected" | "error", code?: string): Response | null {
  const appUrl = Deno.env.get("APP_URL")?.trim();
  if (!appUrl) return null;
  try {
    const url = new URL("/admin", appUrl);
    url.searchParams.set("melhor_envio", result);
    if (code) url.searchParams.set("code", code);
    return Response.redirect(url, 302);
  } catch {
    return null;
  }
}

async function handleCallback(request: Request, headers: HeadersInit): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");

  if (!state) return errorResponse("INVALID_OAUTH_STATE", "Estado OAuth ausente.", 400, headers);

  const admin = createAdminClient();
  const { data: connectedBy, error: stateError } = await admin.rpc("consume_melhor_envio_oauth_state", {
    request_state_hash: await sha256(state),
  });
  if (stateError || !connectedBy) {
    return errorResponse("INVALID_OAUTH_STATE", "Estado OAuth inválido, expirado ou já utilizado.", 400, headers);
  }

  if (providerError || !code) {
    return callbackRedirect("error", "AUTHORIZATION_DENIED")
      ?? errorResponse("AUTHORIZATION_DENIED", "A autorização do Melhor Envio não foi concluída.", 400, headers);
  }

  try {
    await exchangeMelhorEnvioCode(admin, code, String(connectedBy));
    return callbackRedirect("connected")
      ?? jsonResponse({ connected: true, message: "Melhor Envio autorizado com sucesso." }, 200, headers);
  } catch (error) {
    const publicError = melhorEnvioPublicError(error);
    return callbackRedirect("error", publicError.code)
      ?? errorResponse(publicError.code, publicError.message, publicError.status, headers);
  }
}

Deno.serve(async (request) => {
  const headers = corsHeaders(request);
  if (!headers) return errorResponse("ORIGIN_NOT_ALLOWED", "Origem não autorizada.", 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method === "GET") return handleCallback(request, headers);
  if (request.method !== "POST") {
    return errorResponse("METHOD_NOT_ALLOWED", "Método não permitido.", 405, headers);
  }

  let user;
  try {
    user = await requireSuperAdmin(request);
  } catch (error) {
    return error instanceof Error && error.message === "FORBIDDEN"
      ? errorResponse("FORBIDDEN", "Apenas super administradores podem configurar o Melhor Envio.", 403, headers)
      : errorResponse("UNAUTHORIZED", "Sessão inválida ou expirada.", 401, headers);
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400, headers);
  }

  const action = typeof body.action === "string" ? body.action : "status";
  const admin = createAdminClient();

  try {
    const config = melhorEnvioConfig();

    if (action === "authorize") {
      const state = randomState();
      const { error } = await admin.from("melhor_envio_oauth_states").insert({
        state_hash: await sha256(state),
        created_by: user.id,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error("OAUTH_STATE_STORAGE_ERROR");

      return jsonResponse({
        authorizationUrl: melhorEnvioAuthorizationUrl(state),
        callbackUrl: config.redirectUri,
        environment: config.environment,
        mock: config.mock,
      }, 200, headers);
    }

    if (action === "refresh") {
      await getMelhorEnvioAccessToken(admin, true);
    } else if (action !== "status") {
      return errorResponse("INVALID_ACTION", "Ação inválida.", 422, headers);
    }

    const { data: connection, error } = await admin
      .from("melhor_envio_oauth_connections")
      .select("scope, access_expires_at, refresh_expires_at, connected_at, updated_at")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;

    return jsonResponse({
      connected: Boolean(connection),
      environment: config.environment,
      callbackUrl: config.redirectUri,
      mock: config.mock,
      connection: connection ?? null,
    }, 200, headers);
  } catch (error) {
    if (error instanceof Error && error.message === "OAUTH_STATE_STORAGE_ERROR") {
      return errorResponse("OAUTH_STATE_STORAGE_ERROR", "Não foi possível iniciar a autorização.", 500, headers);
    }
    const publicError = melhorEnvioPublicError(error);
    return errorResponse(publicError.code, publicError.message, publicError.status, headers);
  }
});
