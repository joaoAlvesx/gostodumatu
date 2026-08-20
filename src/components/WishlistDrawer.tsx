// src/components/WishlistDrawer.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Trash2 } from "lucide-react";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { formatPrice } from "@/lib/products";
import { useToast } from "@/hooks/use-toast";
import type { Product as WishlistProduct } from "@/context/WishlistContext";
import type { Product as CatalogProduct } from "@/lib/products";

const WishlistDrawer = () => {
  const { wishlist, isOpen, closeWishlist, removeItem } = useWishlist();
  const { addItem, openCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = (product: WishlistProduct) => {
    const catalogProduct: CatalogProduct = {
      ...product,
      image: Array.isArray(product.image) ? product.image : product.image ? [product.image] : [],
      category: product.category ?? "",
      description: product.description ?? "",
    };
    addItem(catalogProduct);
    toast({ title: "Adicionado ao carrinho!", description: product.name });
    openCart();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && closeWishlist()}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-artisan text-2xl">Sua Lista de Desejos</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-6 space-y-4">
          {wishlist.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">
              Sua lista de desejos está vazia.
            </p>
          ) : (
            wishlist.map((product) => (
              <div key={product.id} className="flex gap-3 pb-4 border-b border-border items-center">
                <img
                  src={Array.isArray(product.image) ? product.image[0] : product.image}
                  alt={product.name}
                  className="w-20 h-20 object-cover rounded-md"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{product.name}</h4>
                  <p className="text-primary font-semibold">{formatPrice(product.price)}</p>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs flex items-center gap-1"
                      onClick={() => handleAddToCart(product)}
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      Adicionar ao Carrinho
                    </Button>
                    
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 ml-auto text-destructive"
                      onClick={() => removeItem(product.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default WishlistDrawer;
