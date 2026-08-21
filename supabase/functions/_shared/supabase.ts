import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function createPublicClient(authorization: string): SupabaseClient {
  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function requireAuthenticatedUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");

  const client = createPublicClient(authorization);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("UNAUTHORIZED");
  return data.user;
}

export function requestUsesServiceRole(request: Request): boolean {
  const authorization = request.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(serviceRoleKey && authorization === `Bearer ${serviceRoleKey}`);
}

export async function requireSuperAdmin(request: Request): Promise<User> {
  const user = await requireAuthenticatedUser(request);
  const authorization = request.headers.get("authorization")!;
  const client = createPublicClient(authorization);

  const { data: isSuperAdmin, error: roleError } = await client.rpc("has_role", {
    required_role: "super_admin",
  });
  if (roleError || !isSuperAdmin) throw new Error("FORBIDDEN");

  return user;
}
