const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://gostudumatu.vercel.app",
  "https://gostodumatu.com.br",
  "https://www.gostodumatu.com.br",
];

function allowedOrigins(): string[] {
  const configured = Deno.env.get("ALLOWED_ORIGINS")
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

export function corsHeaders(request: Request): HeadersInit | null {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  if (!allowedOrigins().includes(origin)) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  headers: HeadersInit = {},
): Response {
  return jsonResponse({ error: { code, message } }, status, headers);
}
