import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, LoaderCircle, PackageOpen } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomerAccountNavigation from "@/components/CustomerAccountNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  formatCents,
  formatDateTime,
  loadCustomerOrders,
  ORDER_STATUS_LABELS,
  type CustomerOrder,
} from "@/lib/customer";

function statusVariant(status: CustomerOrder["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "payment_failed" || status === "cancelled") return "destructive";
  if (status === "awaiting_payment") return "secondary";
  return "outline";
}

export default function CustomerOrders() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadCustomerOrders()
      .then((data) => { if (active) setOrders(data); })
      .catch((error) => {
        if (active) toast({ title: "Não foi possível carregar seus pedidos", description: error.message, variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <CustomerAccountNavigation active="orders" />
        <div className="mx-auto max-w-4xl">
          <div className="mb-6">
            <h2 className="font-artisan text-3xl font-semibold">Meus pedidos</h2>
            <p className="text-muted-foreground">Acompanhe compras realizadas com esta conta.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>
          ) : orders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center px-6 py-16 text-center">
                <PackageOpen className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-medium">Você ainda não possui pedidos</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">Quando o checkout estiver disponível, suas compras aparecerão aqui.</p>
                <Button asChild className="mt-6"><Link to="/#produtos">Conhecer os produtos</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => (
                <Link key={order.id} to={`/minha-conta/pedidos/${order.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Card className="transition-organic hover:border-primary/40 hover:shadow-soft">
                    <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">Pedido #{order.order_number}</h3>
                          <Badge variant={statusVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Realizado em {formatDateTime(order.created_at)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-4 sm:justify-end">
                        <span className="font-semibold text-primary">{formatCents(order.total_amount_cents)}</span>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
