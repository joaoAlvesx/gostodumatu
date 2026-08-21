import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import AuthCardLayout from "@/components/AuthCardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authCallbackUrl } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: authCallbackUrl("/atualizar-senha"),
    });
    setSubmitting(false);
    if (error) setErrorMessage(error.message);
    else setSent(true);
  };

  return (
    <AuthCardLayout title="Recuperar senha" description="Receba por e-mail um link seguro para criar uma nova senha.">
      {sent ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Se houver uma conta para <strong className="text-foreground">{email}</strong>, você receberá as instruções em instantes.
          </p>
          <Link to="/entrar" className="block text-sm font-medium text-primary hover:underline">Voltar para o login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{errorMessage}</AlertDescription></Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="recovery-email">E-mail</Label>
            <Input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <LoaderCircle className="animate-spin" />} Enviar link de recuperação
          </Button>
          <Link to="/entrar" className="block text-center text-sm text-primary hover:underline">Voltar para o login</Link>
        </form>
      )}
    </AuthCardLayout>
  );
}
