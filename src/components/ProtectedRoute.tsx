import { Navigate, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <LoaderCircle className="h-8 w-8 animate-spin text-primary" aria-label="Carregando sessão" />
      </div>
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/entrar?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return <>{children}</>;
}
