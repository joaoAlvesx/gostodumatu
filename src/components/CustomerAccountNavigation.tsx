import { Link, useNavigate } from "react-router-dom";
import { LogOut, MapPinHouse, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

export default function CustomerAccountNavigation({ active }: { active: "account" | "orders" }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      toast({
        title: "Não foi possível sair",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mb-8 flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-artisan text-2xl font-semibold">Minha conta</h1>
        <p className="text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant={active === "account" ? "default" : "outline"} size="sm">
          <Link to="/minha-conta"><MapPinHouse /> Dados e endereços</Link>
        </Button>
        <Button asChild variant={active === "orders" ? "default" : "outline"} size="sm">
          <Link to="/minha-conta/pedidos"><PackageSearch /> Pedidos</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" className={cn("ml-auto sm:ml-0")} onClick={handleSignOut}>
          <LogOut /> Sair
        </Button>
      </div>
    </div>
  );
}
