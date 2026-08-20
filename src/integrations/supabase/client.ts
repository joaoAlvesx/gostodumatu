import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias.");
}

// Este cliente é exclusivamente público. Chaves secretas/service_role ficam apenas
// nas Edge Functions e nunca usam o prefixo VITE_.
export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
