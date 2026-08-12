import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Store, MapPin, ArrowRight } from "lucide-react";
import { loadProducers, type Producer } from "@/lib/producers";

const ProducerGrid = () => {
  const [producers, setProducers] = useState<Producer[]>([]);

  useEffect(() => {
    const fetchProducers = async () => {
      const data = await loadProducers();
      setProducers(data);
    };
    fetchProducers();

    window.addEventListener("producers:updated", fetchProducers);
    return () => window.removeEventListener("producers:updated", fetchProducers);
  }, []);

  if (producers.length === 0) return null;

  return (
    <section id="produtores" className="py-14 sm:py-20 bg-background border-t border-border/50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10 sm:mb-16">
          <Badge variant="secondary" className="mb-4">Quem Faz Nossos Sabores</Badge>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-artisan font-bold text-foreground mb-4 sm:mb-6">
            Nossos <span className="text-primary">Produtores Locais</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Conheça as famílias e propriedades rurais que produzem com carinho as delícias da nossa terra.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {producers.map((producer) => (
            <Card key={producer.id} className="group hover:shadow-warm transition-organic border border-border/50 bg-card overflow-hidden">
              <CardContent className="p-6 text-center flex flex-col items-center">
                {producer.image ? (
                  <img 
                    src={producer.image} 
                    alt={producer.name} 
                    className="w-24 h-24 object-cover rounded-full mb-4 border-2 border-primary/20 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-24 h-24 bg-muted rounded-full flex items-center justify-center text-muted-foreground mb-4">
                    <Store className="h-10 w-10" />
                  </div>
                )}

                <h3 className="font-artisan text-2xl font-bold text-foreground mb-1">
                  {producer.name}
                </h3>

                {producer.location && (
                  <div className="flex items-center gap-1 text-xs text-primary mb-3">
                    <MapPin className="h-3 w-3" />
                    <span>{producer.location}</span>
                  </div>
                )}

                <p className="text-muted-foreground text-sm line-clamp-3 mb-6">
                  {producer.bio || "Sem biografia cadastrada."}
                </p>

                <Link to={`/produtor/${producer.slug}`} className="w-full mt-auto">
                  <Button variant="outline" className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    Ver História e Produtos
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProducerGrid;