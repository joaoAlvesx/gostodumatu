import { supabase } from "@/integrations/supabase/client";

export type MelhorEnvioConnectionStatus = {
  connected: boolean;
  environment: "sandbox" | "production";
  mock: boolean;
  callbackUrl: string;
  connection: null | {
    scope: string | null;
    access_expires_at: string;
    refresh_expires_at: string;
    connected_at: string;
    updated_at: string;
  };
};

type AuthorizationResponse = {
  authorizationUrl: string;
  callbackUrl: string;
  environment: "sandbox" | "production";
  mock: boolean;
};

async function invoke<T>(action: "status" | "authorize" | "refresh"): Promise<T> {
  const { data, error } = await supabase.functions.invoke("melhor-envio-oauth", {
    body: { action },
  });
  if (error) throw new Error(error.message || "Não foi possível acessar a integração do Melhor Envio.");
  return data as T;
}

export function loadMelhorEnvioStatus(): Promise<MelhorEnvioConnectionStatus> {
  return invoke<MelhorEnvioConnectionStatus>("status");
}

export function beginMelhorEnvioAuthorization(): Promise<AuthorizationResponse> {
  return invoke<AuthorizationResponse>("authorize");
}

export function refreshMelhorEnvioAuthorization(): Promise<MelhorEnvioConnectionStatus> {
  return invoke<MelhorEnvioConnectionStatus>("refresh");
}
