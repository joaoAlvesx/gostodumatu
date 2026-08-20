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
