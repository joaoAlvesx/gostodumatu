import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import AuthCardLayout from "@/components/AuthCardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/AuthContext";
import { authCallbackUrl, safeRedirectPath } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export default function CustomerAuth({ mode }: { mode: "login" | "signup" }) {
  const { user, loading: sessionLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (!sessionLoading && user) return <Navigate to={redirect} replace />;

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim(), name: fullName.trim() },
            emailRedirectTo: authCallbackUrl(redirect),
          },
        });
        if (error) throw error;
        if (data.session) navigate(redirect, { replace: true });
        else setConfirmationSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate(redirect, { replace: true });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível autenticar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setSubmitting(true);
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authCallbackUrl(redirect) },
    });
    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthCardLayout title="Confira seu e-mail" description="Enviamos o link de confirmação da sua conta.">
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Abra a mensagem enviada para <strong className="text-foreground">{email}</strong> e confirme o cadastro para entrar.
          </p>
          <Button variant="outline" className="w-full" onClick={() => setConfirmationSent(false)}>
            Usar outro e-mail
          </Button>
          <Link to="/entrar" className="block text-sm text-primary hover:underline">Voltar para o login</Link>
        </div>
      </AuthCardLayout>
    );
  }

  const isSignup = mode === "signup";
  return (
    <AuthCardLayout
      title={isSignup ? "Criar sua conta" : "Entrar"}
      description={isSignup ? "Cadastre-se para salvar endereços e acompanhar pedidos." : "Acesse seus endereços e pedidos."}
    >
      <div className="space-y-5">
        {errorMessage && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={submitting}>
          <span className="text-base font-bold">G</span> Continuar com Google
        </Button>

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs uppercase text-muted-foreground">ou</span>
          <Separator className="flex-1" />
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {isSignup && (
            <div className="space-y-2">
              <Label htmlFor="full-name">Nome completo</Label>
              <Input id="full-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="customer-email">E-mail</Label>
            <Input id="customer-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="customer-password">Senha</Label>
              {!isSignup && <Link to="/recuperar-senha" className="text-xs text-primary hover:underline">Esqueci minha senha</Link>}
            </div>
            <Input
              id="customer-password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {isSignup && <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>}
          </div>
          <Button type="submit" className="w-full" disabled={submitting || sessionLoading}>
            {submitting && <LoaderCircle className="animate-spin" />}
            {isSignup ? "Criar conta" : "Entrar com e-mail"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isSignup ? "Já possui uma conta?" : "Ainda não possui uma conta?"}{" "}
          <Link to={isSignup ? "/entrar" : "/cadastro"} className="font-medium text-primary hover:underline">
            {isSignup ? "Entrar" : "Criar conta"}
          </Link>
        </p>
      </div>
    </AuthCardLayout>
  );
}
