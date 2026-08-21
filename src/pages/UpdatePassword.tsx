import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, LoaderCircle } from "lucide-react";
import AuthCardLayout from "@/components/AuthCardLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export default function UpdatePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage("");
    if (password.length < 8) {
      setErrorMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) setErrorMessage(error.message);
    else navigate("/minha-conta", { replace: true });
  };

  return (
    <AuthCardLayout title="Criar nova senha" description="Escolha uma senha segura para sua conta.">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{errorMessage}</AlertDescription></Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova senha</Label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password-confirmation">Confirmar nova senha</Label>
          <Input id="password-confirmation" type="password" autoComplete="new-password" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting && <LoaderCircle className="animate-spin" />} Atualizar senha
        </Button>
      </form>
    </AuthCardLayout>
  );
}
