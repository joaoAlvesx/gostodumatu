import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, MessageCircle } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/products";
import { useToast } from "@/hooks/use-toast";

const WHATSAPP_NUMBER = "5567996850272";

const CartDrawer = () => {
  const { items, isOpen, closeCart, updateQuantity, removeItem, total, clear } = useCart();
  const { toast } = useToast();

  const sendToWhatsApp = () => {
    if (items.length === 0) return;
    const lines = items.map(
      (i) => `• ${i.quantity}x ${i.product.name} — ${formatPrice(i.product.price * i.quantity)}`
    );
    const message =
      `Olá! Gostaria de fazer um pedido na *Gostudumatu*:\n\n${lines.join("\n")}\n\n*Total: ${formatPrice(total)}*\n\nAguardo instruções para pagamento e entrega. Obrigado!`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
    toast({ title: "Pedido enviado!", description: "Continue a conversa no WhatsApp." });
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && closeCart()}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-artisan text-2xl">Seu carrinho</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-4">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Seu carrinho está vazio.
            </p>
          ) : (
            items.map((item) => (
              <div key={item.product.id} className="flex gap-3 pb-4 border-b border-border">
                <img
                  src={item.product.image[0] ?? "/placeholder.svg"}
                  alt={item.product.name}
                  className="w-20 h-20 object-cover rounded-md"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{item.product.name}</h4>
                  <p className="text-primary font-semibold">{formatPrice(item.product.price)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm w-6 text-center">{item.quantity}</span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 ml-auto text-destructive"
                      onClick={() => removeItem(item.product.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <SheetFooter className="flex-col gap-3 sm:flex-col">
            <div className="flex justify-between w-full text-lg font-semibold">
              <span>Total</span>
              <span className="text-primary">{formatPrice(total)}</span>
            </div>
            <Button
              onClick={sendToWhatsApp}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              <MessageCircle className="h-5 w-5 mr-2" />
              Finalizar pelo WhatsApp
            </Button>
            <Button variant="ghost" size="sm" onClick={clear} className="w-full">
              Limpar carrinho
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              O pagamento e frete serão combinados diretamente pelo WhatsApp.
            </p>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CartDrawer;
