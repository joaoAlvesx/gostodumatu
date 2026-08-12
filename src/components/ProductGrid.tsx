import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Heart, ShoppingCart, Star, X, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadProducts, formatPrice, type Product } from "@/lib/products";
import { loadProducers, type Producer } from "@/lib/producers";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";

const ProductGrid = () => {
  const { toast } = useToast();
  const { addItem, openCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const [products, setProducts] = useState<Product[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentImgIdx, setCurrentImgIdx] = useState<number>(0);

  const fetchData = async () => {
    const [dataProducts, dataProducers] = await Promise.all([
      loadProducts(),
      loadProducers(),
    ]);
    setProducts(dataProducts);
    setProducers(dataProducers);
  };

  useEffect(() => {
    fetchData();

    window.addEventListener("products:updated", fetchData);
    window.addEventListener("producers:updated", fetchData);
    window.addEventListener("storage", fetchData);
    return () => {
      window.removeEventListener("products:updated", fetchData);
      window.removeEventListener("producers:updated", fetchData);
      window.removeEventListener("storage", fetchData); 
    };
  }, []);

  const handleAddToCart = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation(); 
    addItem(product);
    toast({ title: "Adicionado ao carrinho!", description: product.name });
    openCart();
  };

  const handleWishlist = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation(); 
    const active = isInWishlist(product.id);

    const imageString = Array.isArray(product.image) ? product.image[0] : product.image;

    toggleWishlist({
      id: product.id,
      name: product.name,
      price: product.price,
      image: imageString
    });

    toast({ 
      title: active ? "Removido dos favoritos" : "Salvo na lista de desejos!", 
      description: product.name 
    });
  };

  const getImagesArray = (img: string | string[]): string[] => {
    if (Array.isArray(img)) return img;
    return img ? [img] : [];
  };

  return (
    <section id="produtos" className="py-16 sm:py-24 bg-gradient-white">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-16">
          <Badge variant="secondary" className="mb-4">Nossos Produtos</Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-artisan font-bold text-foreground mb-4 sm:mb-6">
            Sabores do<span className="text-primary"> Nosso Chão</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Produtos artesanais feitos com receitas de família por produtores locais de Jardim/MS.
          </p>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-12 bg-card/40 rounded-xl border border-border/40 max-w-lg mx-auto">
            <p className="text-muted-foreground text-base mb-2">Nenhum produto cadastrado no momento.</p>
            <p className="text-xs text-muted-foreground">
              Acesse a área <Link to="/admin" className="text-primary underline">/admin</Link> para cadastrar produtos e vinculá-los aos produtores.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product) => {
              const producer = producers.find((p) => p.id === product.producerId);
              const imagesArray = getImagesArray(product.image);
              
              // -------------------------------------------------------------
              // DECLARAÇÃO DA VARIÁVEL QUE FALTAVA
              // -------------------------------------------------------------
              const isFav = isInWishlist(product.id);

              return (
                <Card 
                  key={product.id} 
                  onClick={() => {
                    setSelectedProduct(product);
                    setCurrentImgIdx(0);
                  }}
                  className="group hover:shadow-warm transition-organic bg-card/90 backdrop-blur-sm border border-border/50 cursor-pointer flex flex-col justify-between overflow-hidden"
                >
                  <div>
                    {/* CONTAINER DA IMAGEM COM PROPORÇÃO 1:1 (QUADRADA) */}
                    <div className="relative overflow-hidden rounded-t-lg bg-muted">
                      <img
                        src={imagesArray[0] || ""} 
                        alt={product.name}
                        className="w-full aspect-square object-cover group-hover:scale-105 transition-organic"
                      />
                      <div className="absolute top-3 left-3 space-y-1.5 flex flex-col items-start">
                        {product.isNew && <Badge className="bg-primary text-primary-foreground">Novo</Badge>}
                        <Badge variant="secondary">{product.category}</Badge>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-3 right-3 bg-background/80 hover:bg-background text-foreground z-10"
                        onClick={(e) => handleWishlist(product, e)}
                      >
                        <Heart 
                          className={`h-4 w-4 transition-colors ${
                            isFav ? "fill-red-500 text-red-500" : "text-muted-foreground"
                          }`} 
                        />
                      </Button>

                      <div className="absolute inset-0 bg-foreground/20 opacity-0 group-hover:opacity-100 transition-organic flex items-center justify-center">
                        <Button
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                          onClick={(e) => handleAddToCart(product, e)}
                        >
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          Visualizar Detalhes
                        </Button>
                      </div>
                    </div>

                    <CardContent className="p-6">
                      {producer && (
                        <Link 
                          to={`/produtor/${producer.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline mb-2 bg-primary/10 px-2.5 py-1 rounded-full"
                        >
                          <Store className="h-3.5 w-3.5" />
                          <span>{producer.name}</span>
                        </Link>
                      )}

                      <div className="flex items-center space-x-1 mb-2">
                        <div className="flex items-center">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className="h-4 w-4 text-primary fill-primary" />
                          ))}
                        </div>
                      </div>

                      <h3 className="font-semibold text-lg text-foreground mb-2">{product.name}</h3>
                      <p className="text-muted-foreground text-sm mb-4 truncate">{product.description}</p>
                    </CardContent>
                  </div>

                  <CardContent className="p-6 pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-2xl font-bold text-primary">{formatPrice(product.price)}</span>
                        {product.originalPrice && (
                          <span className="text-sm text-muted-foreground line-through">
                            {formatPrice(product.originalPrice)}
                          </span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={(e) => handleAddToCart(product, e)}>
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* MODAL COM PROPORÇÃO 4:3 */}
        <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
          {selectedProduct && (() => {
            const producer = producers.find((p) => p.id === selectedProduct.producerId);
            const imagesArray = getImagesArray(selectedProduct.image);

            return (
              <DialogContent className="max-w-xl w-[calc(100%-2rem)] bg-card/95 border border-border/80 text-foreground rounded-lg p-0 overflow-hidden shadow-2xl">
                <div className="relative bg-muted">
                  <img 
                    src={imagesArray[currentImgIdx] || ""} 
                    alt={selectedProduct.name} 
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setSelectedProduct(null)}
                    className="absolute top-4 right-4 bg-background/80 hover:bg-background text-foreground rounded-full h-8 w-8 z-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  {imagesArray.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex gap-2 bg-background/60 backdrop-blur-sm p-1.5 rounded-md z-40">
                      {imagesArray.map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          onClick={() => setCurrentImgIdx(idx)}
                          className={`w-10 h-10 object-cover rounded cursor-pointer border-2 transition-all ${currentImgIdx === idx ? 'border-primary scale-105' : 'border-transparent opacity-80 hover:opacity-100'}`}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 sm:p-8 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedProduct.isNew && <Badge className="bg-primary text-primary-foreground">Novo</Badge>}
                    <Badge variant="secondary">{selectedProduct.category}</Badge>
                    {producer && (
                      <Link 
                        to={`/produtor/${producer.slug}`}
                        onClick={() => setSelectedProduct(null)}
                        className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-full hover:underline font-medium"
                      >
                        <Store className="h-3 w-3" />
                        <span>{producer.name}</span>
                      </Link>
                    )}
                  </div>

                  <DialogTitle className="font-artisan text-2xl sm:text-3xl font-bold text-foreground">
                    {selectedProduct.name}
                  </DialogTitle>

                  <DialogDescription className="text-muted-foreground text-sm sm:text-base leading-relaxed pt-2">
                    {selectedProduct.description || "Sem descrição disponível para este produto da roça."}
                  </DialogDescription>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-6 border-t border-border/50">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl sm:text-3xl font-bold text-primary">{formatPrice(selectedProduct.price)}</span>
                      {selectedProduct.originalPrice && (
                        <span className="text-base text-muted-foreground line-through">
                          {formatPrice(selectedProduct.originalPrice)}
                        </span>
                      )}
                    </div>

                    <Button 
                      size="lg"
                      className="bg-primary hover:bg-primary/90 text-primary-foreground w-full sm:w-auto"
                      onClick={() => {
                        handleAddToCart(selectedProduct);
                        setSelectedProduct(null); 
                      }}
                    >
                      <ShoppingCart className="h-5 w-5 mr-2" />
                      Adicionar à Sacola
                    </Button>
                  </div>
                </div>
              </DialogContent>
            );
          })()}
        </Dialog>
      </div>
    </section>
  );
};

export default ProductGrid;