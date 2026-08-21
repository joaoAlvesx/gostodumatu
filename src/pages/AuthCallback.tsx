import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import AuthCardLayout from "@/components/AuthCardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { safeRedirectPath } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const finishAuthentication = async () => {
      const providerError = searchParams.get("error_description") || searchParams.get("error");
      if (providerError) {
        setErrorMessage(providerError);
        return;
      }

      const next = safeRedirectPath(searchParams.get("next"));
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;
      if (sessionError) {
        setErrorMessage(sessionError.message);
        return;
      }

      if (!sessionData.session) {
        const code = searchParams.get("code");
        if (!code) {
          setErrorMessage("O link de autenticação é inválido ou expirou.");
          return;
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!active) return;
        if (error) {
          setErrorMessage(error.message);
          return;
        }
      }

      navigate(next, { replace: true });
    };

    void finishAuthentication();
    return () => { active = false; };
  }, [navigate, searchParams]);

  return (
    <AuthCardLayout title="Autenticando" description="Estamos concluindo o acesso à sua conta.">
      {errorMessage ? (
        <div className="space-y-4">
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{errorMessage}</AlertDescription></Alert>
          <Button className="w-full" onClick={() => navigate("/entrar", { replace: true })}>Voltar para o login</Button>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <LoaderCircle className="h-6 w-6 animate-spin text-primary" /> Aguarde um instante…
        </div>
      )}
    </AuthCardLayout>
  );
}
