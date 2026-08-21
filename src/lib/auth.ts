import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export async function loadCurrentUserRoles(): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role");
  if (error) throw error;
  return data.map(({ role }) => role);
}

export async function currentUserIsSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_role", { required_role: "super_admin" });
  if (error) throw error;
  return data;
}

export function safeRedirectPath(value: string | null, fallback = "/minha-conta"): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function authCallbackUrl(next: string): string {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", safeRedirectPath(next));
  return url.toString();
}
