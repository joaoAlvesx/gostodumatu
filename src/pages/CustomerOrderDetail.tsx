import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LoaderCircle, MapPin, PackageOpen, ReceiptText } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomerAccountNavigation from "@/components/CustomerAccountNavigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCents,
  formatDateTime,
  jsonObject,
  loadCustomerOrder,
  ORDER_STATUS_LABELS,
  type CustomerOrder,
  type CustomerOrderItem,
} from "@/lib/customer";
import type { Json } from "@/integrations/supabase/types";

function textValue(value: Json | undefined): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function firstImage(value: Json | undefined): string | null {
  if (!Array.isArray(value)) return null;
  const image = value.find((entry) => typeof entry === "string");
  return typeof image === "string" ? image : null;
}

function statusVariant(status: CustomerOrder["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "paid") return "default";
  if (status === "payment_failed" || status === "cancelled") return "destructive";
  if (status === "awaiting_payment") return "secondary";
  return "outline";
}

export default function CustomerOrderDetail() {
  const { id = "" } = useParams();
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [items, setItems] = useState<CustomerOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    void loadCustomerOrder(id)
      .then((data) => {
        if (!active) return;
        setOrder(data.order);
        setItems(data.items);
      })
      .catch((error) => { if (active) setErrorMessage(error instanceof Error ? error.message : "Pedido não encontrado."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const address = order ? jsonObject(order.shipping_address_snapshot) : {};

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <CustomerAccountNavigation active="orders" />
        <div className="mx-auto max-w-4xl">
          <Button asChild variant="ghost" className="mb-4 -ml-4"><Link to="/minha-conta/pedidos"><ArrowLeft /> Voltar aos pedidos</Link></Button>
          {loading ? (
            <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>
          ) : errorMessage || !order ? (
            <Alert variant="destructive"><PackageOpen className="h-4 w-4" /><AlertDescription>{errorMessage || "Pedido não encontrado."}</AlertDescription></Alert>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="font-artisan text-3xl font-semibold">Pedido #{order.order_number}</h2>
                  <p className="text-sm text-muted-foreground">Realizado em {formatDateTime(order.created_at)}</p>
                </div>
                <Badge variant={statusVariant(order.status)} className="w-fit px-3 py-1">{ORDER_STATUS_LABELS[order.status]}</Badge>
              </div>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 font-artisan"><ReceiptText className="text-primary" /> Produtos</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {items.map((item) => {
                    const snapshot = jsonObject(item.product_snapshot);
                    const image = firstImage(snapshot.image);
                    return (
                      <div key={item.id} className="flex items-center gap-4 border-b pb-4 last:border-0 last:pb-0">
                        {image ? <img src={image} alt="" className="h-16 w-16 rounded-md object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-md bg-muted"><PackageOpen className="text-muted-foreground" /></div>}
                        <div className="min-w-0 flex-1"><h3 className="truncate font-medium">{item.product_name}</h3><p className="text-sm text-muted-foreground">{item.quantity} × {formatCents(item.unit_price_cents)}</p></div>
                        <span className="font-medium">{formatCents(item.line_total_cents ?? item.unit_price_cents * item.quantity)}</span>
                      </div>
                    );
                  })}
                  <div className="ml-auto max-w-sm space-y-2 border-t pt-4 text-sm">
                    <div className="flex justify-between gap-8"><span className="text-muted-foreground">Subtotal</span><span>{formatCents(order.subtotal_amount_cents)}</span></div>
                    <div className="flex justify-between gap-8"><span className="text-muted-foreground">Frete</span><span>{formatCents(order.shipping_amount_cents)}</span></div>
                    {order.discount_amount_cents > 0 && <div className="flex justify-between gap-8"><span className="text-muted-foreground">Desconto</span><span>− {formatCents(order.discount_amount_cents)}</span></div>}
                    <div className="flex justify-between gap-8 border-t pt-2 text-base font-semibold"><span>Total</span><span className="text-primary">{formatCents(order.total_amount_cents)}</span></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2 font-artisan"><MapPin className="text-primary" /> Endereço de entrega</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{textValue(address.recipient_name)}</p>
                  <p>{textValue(address.street)}, {textValue(address.number)}{address.complement ? ` — ${textValue(address.complement)}` : ""}</p>
                  <p>{textValue(address.neighborhood)}, {textValue(address.city)}/{textValue(address.state)}</p>
                  <p>CEP {textValue(address.postal_code)}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
