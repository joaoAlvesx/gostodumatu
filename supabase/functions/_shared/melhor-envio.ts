import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_SCOPES = [
  "cart-read",
  "cart-write",
  "orders-read",
  "purchases-read",
  "shipping-calculate",
  "shipping-cancel",
  "shipping-checkout",
  "shipping-generate",
  "shipping-preview",
  "shipping-print",
  "shipping-tracking",
];

type TokenPayload = {
  token_type?: unknown;
  expires_in?: unknown;
  access_token?: unknown;
  refresh_token?: unknown;
  refresh_token_expires_in?: unknown;
  scope?: unknown;
};

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  access_expires_at: string;
  refresh_expires_at: string;
};

export type MelhorEnvioConfig = {
  environment: "sandbox" | "production";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userAgent: string;
  scopes: string[];
  services?: string;
  mock: boolean;
};

export class MelhorEnvioError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new MelhorEnvioError("MELHOR_ENVIO_NOT_CONFIGURED", `Variável ${name} não configurada.`, 503);
  return value;
}

export function melhorEnvioConfig(): MelhorEnvioConfig {
  const environmentValue = (Deno.env.get("MELHOR_ENVIO_ENV") ?? "sandbox").trim().toLowerCase();
  if (environmentValue !== "sandbox" && environmentValue !== "production") {
    throw new MelhorEnvioError("MELHOR_ENVIO_NOT_CONFIGURED", "MELHOR_ENVIO_ENV deve ser sandbox ou production.", 503);
  }

  const supabaseUrl = requiredEnvironment("SUPABASE_URL").replace(/\/$/, "");
  const configuredScopes = Deno.env.get("MELHOR_ENVIO_SCOPES")
    ?.split(/[ ,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    environment: environmentValue,
    baseUrl: environmentValue === "sandbox"
      ? "https://sandbox.melhorenvio.com.br"
      : "https://melhorenvio.com.br",
    clientId: requiredEnvironment("MELHOR_ENVIO_CLIENT_ID"),
    clientSecret: requiredEnvironment("MELHOR_ENVIO_CLIENT_SECRET"),
    redirectUri: Deno.env.get("MELHOR_ENVIO_REDIRECT_URI")?.trim()
      || `${supabaseUrl}/functions/v1/melhor-envio-oauth`,
    userAgent: requiredEnvironment("MELHOR_ENVIO_USER_AGENT"),
    scopes: configuredScopes?.length ? configuredScopes : DEFAULT_SCOPES,
    services: Deno.env.get("MELHOR_ENVIO_SERVICES")?.trim() || undefined,
    mock: Deno.env.get("MELHOR_ENVIO_MOCK") === "true",
  };
}

export function melhorEnvioAuthorizationUrl(state: string): string {
  const config = melhorEnvioConfig();
  const url = new URL("/oauth/authorize", config.baseUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", config.scopes.join(" "));
  return url.toString();
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

async function requestToken(parameters: URLSearchParams): Promise<TokenPayload> {
  const config = melhorEnvioConfig();
  const response = await fetch(`${config.baseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
    },
    body: parameters,
  });
  const payload = await parseResponse(response);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new MelhorEnvioError(
      "MELHOR_ENVIO_TOKEN_ERROR",
      "O Melhor Envio recusou a solicitação de token.",
      502,
      payload,
    );
  }
  return payload as TokenPayload;
}

function tokenString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) {
    throw new MelhorEnvioError("MELHOR_ENVIO_TOKEN_ERROR", `Resposta OAuth sem ${name}.`, 502);
  }
  return value;
}

function positiveSeconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function storeTokens(
  admin: SupabaseClient,
  payload: TokenPayload,
  connectedBy: string | null,
  fallbackRefreshToken?: string,
): Promise<void> {
  const accessToken = tokenString(payload.access_token, "access_token");
  const refreshToken = typeof payload.refresh_token === "string" && payload.refresh_token
    ? payload.refresh_token
    : fallbackRefreshToken;
  if (!refreshToken) {
    throw new MelhorEnvioError("MELHOR_ENVIO_TOKEN_ERROR", "Resposta OAuth sem refresh_token.", 502);
  }

  const now = Date.now();
  const accessLifetime = positiveSeconds(payload.expires_in, 30 * 24 * 60 * 60);
  const refreshLifetime = positiveSeconds(payload.refresh_token_expires_in, 45 * 24 * 60 * 60);
  const accessExpiresAt = new Date(now + accessLifetime * 1000);
  const refreshExpiresAt = new Date(now + Math.max(refreshLifetime, accessLifetime + 60) * 1000);

  const { error } = await admin.rpc("store_melhor_envio_oauth_tokens", {
    access_token: accessToken,
    refresh_token: refreshToken,
    access_expires_at: accessExpiresAt.toISOString(),
    refresh_expires_at: refreshExpiresAt.toISOString(),
    token_type: typeof payload.token_type === "string" ? payload.token_type : "Bearer",
    granted_scope: typeof payload.scope === "string" ? payload.scope : null,
    connected_by: connectedBy,
  });
  if (error) {
    throw new MelhorEnvioError("MELHOR_ENVIO_TOKEN_STORAGE_ERROR", "Não foi possível guardar os tokens no Vault.", 500);
  }
}

export async function exchangeMelhorEnvioCode(
  admin: SupabaseClient,
  code: string,
  connectedBy: string,
): Promise<void> {
  const config = melhorEnvioConfig();
  const payload = await requestToken(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  }));
  await storeTokens(admin, payload, connectedBy);
}

async function readStoredTokens(admin: SupabaseClient): Promise<StoredTokens | null> {
  const { data, error } = await admin.rpc("get_melhor_envio_oauth_tokens");
  if (error) {
    throw new MelhorEnvioError("MELHOR_ENVIO_TOKEN_STORAGE_ERROR", "Não foi possível ler os tokens do Vault.", 500);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? row as StoredTokens : null;
}

function accessTokenIsUsable(tokens: StoredTokens): boolean {
  return new Date(tokens.access_expires_at).getTime() > Date.now() + 5 * 60 * 1000;
}

async function waitForConcurrentRefresh(admin: SupabaseClient): Promise<StoredTokens | null> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const tokens = await readStoredTokens(admin);
    if (tokens && accessTokenIsUsable(tokens)) return tokens;
  }
  return null;
}

export async function getMelhorEnvioAccessToken(
  admin: SupabaseClient,
  forceRefresh = false,
): Promise<string> {
  const config = melhorEnvioConfig();
  if (config.mock) return "mock-access-token";

  const stored = await readStoredTokens(admin);
  if (!stored) {
    throw new MelhorEnvioError("MELHOR_ENVIO_NOT_AUTHORIZED", "Autorize a aplicação do Melhor Envio primeiro.", 409);
  }
  if (!forceRefresh && accessTokenIsUsable(stored)) return stored.access_token;
  if (new Date(stored.refresh_expires_at).getTime() <= Date.now()) {
    throw new MelhorEnvioError("MELHOR_ENVIO_REAUTH_REQUIRED", "O refresh token expirou; autorize a aplicação novamente.", 409);
  }

  const { data: claimed, error: claimError } = await admin.rpc("claim_melhor_envio_token_refresh");
  if (claimError) {
    throw new MelhorEnvioError("MELHOR_ENVIO_TOKEN_STORAGE_ERROR", "Não foi possível iniciar a renovação do token.", 500);
  }
  if (!claimed) {
    const refreshed = await waitForConcurrentRefresh(admin);
    if (refreshed) return refreshed.access_token;
    throw new MelhorEnvioError("MELHOR_ENVIO_REFRESH_BUSY", "Outra solicitação ainda está renovando o token.", 503);
  }

  try {
    const payload = await requestToken(new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: stored.refresh_token,
    }));
    await storeTokens(admin, payload, null, stored.refresh_token);
    return tokenString(payload.access_token, "access_token");
  } catch (error) {
    await admin.rpc("release_melhor_envio_token_refresh");
    throw error;
  }
}

function mockResponse(path: string, body: unknown): unknown {
  if (path === "/api/v2/me/shipment/calculate") {
    const products = body && typeof body === "object" && Array.isArray((body as { products?: unknown }).products)
      ? (body as { products: Array<Record<string, unknown>> }).products
      : [];
    const weight = products.reduce((sum, product) => sum + Number(product.weight ?? 0) * Number(product.quantity ?? 1), 0);
    const base = 1590 + Math.round(weight * 320);
    const totalWeight = Math.max(weight, 0.1);
    const packageProducts = products.map((product) => ({ id: product.id, quantity: product.quantity }));
    const packages = [{
      price: (base / 100).toFixed(2),
      weight: totalWeight,
      dimensions: { height: 15, width: 20, length: 25 },
      products: packageProducts,
    }];
    return [
      {
        id: 1,
        name: "PAC (mock local)",
        custom_price: (base / 100).toFixed(2),
        custom_delivery_time: 6,
        company: { id: 1, name: "Correios", picture: "" },
        packages,
      },
      {
        id: 2,
        name: "SEDEX (mock local)",
        custom_price: ((base + 900) / 100).toFixed(2),
        custom_delivery_time: 3,
        company: { id: 1, name: "Correios", picture: "" },
        packages: packages.map((item) => ({ ...item, price: ((base + 900) / 100).toFixed(2) })),
      },
    ];
  }
  if (path === "/api/v2/me/cart") return { id: crypto.randomUUID(), protocol: "MOCK" };
  if (path === "/api/v2/me/shipment/checkout") return { purchase: { id: crypto.randomUUID() } };
  if (path === "/api/v2/me/shipment/generate") return { status: true };
  if (path === "/api/v2/me/shipment/print") return { url: "https://sandbox.melhorenvio.com.br/mock-label" };
  if (path === "/api/v2/me/shipment/tracking") return {};
  return {};
}

export async function melhorEnvioRequest<T>(
  admin: SupabaseClient,
  path: string,
  init: { method?: string; body?: unknown } = {},
  allowAuthRetry = true,
): Promise<T> {
  const config = melhorEnvioConfig();
  if (config.mock) return mockResponse(path, init.body) as T;

  const accessToken = await getMelhorEnvioAccessToken(admin);
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": config.userAgent,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = await parseResponse(response);

  if (response.status === 401 && allowAuthRetry) {
    await getMelhorEnvioAccessToken(admin, true);
    return melhorEnvioRequest<T>(admin, path, init, false);
  }
  if (!response.ok) {
    throw new MelhorEnvioError(
      "MELHOR_ENVIO_API_ERROR",
      "O Melhor Envio não conseguiu concluir a operação.",
      response.status >= 400 && response.status < 500 ? 422 : 502,
      payload,
    );
  }
  return payload as T;
}

export function melhorEnvioPublicError(error: unknown): { code: string; message: string; status: number } {
  if (error instanceof MelhorEnvioError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  return { code: "INTERNAL_ERROR", message: "Não foi possível concluir a integração com o Melhor Envio.", status: 500 };
}
