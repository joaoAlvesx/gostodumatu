import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Handshake, Users, Leaf, Heart } from "lucide-react";

const About = () => {
  const values = [
    {
      icon: Handshake,
      title: "Direto do Produtor",
      description: "Sem atravessadores. Você compra direto de quem faz, valorizando o trabalho artesanal.",
    },
    {
      icon: Users,
      title: "Receitas de Família",
      description: "Sabores preservados de geração em geração, com o carinho de quem cozinha em casa.",
    },
    {
      icon: Leaf,
      title: "Ingredientes Naturais",
      description: "Produtos feitos com ingredientes da região, sem conservantes nem aditivos industriais.",
    },
    {
      icon: Heart,
      title: "Sabor de Verdade",
      description: "Aquele gosto de roça que a gente sente falta — autêntico, feito com tempo e cuidado.",
    },
  ];

  return (
    <section id="sobre" className="py-16 sm:py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* Content */}
          <div>
            <Badge variant="secondary" className="mb-4">
              Nossa História
            </Badge>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-artisan font-bold text-foreground mb-4 sm:mb-6">
              Do Produtor
              <span className="text-primary"> pra Sua Mesa</span>
            </h2>
            <div className="space-y-6 text-muted-foreground leading-relaxed">
              <p>
                A <strong className="text-foreground">Gostudumatu</strong> nasceu da vontade de
                facilitar o encontro entre quem faz e quem valoriza o verdadeiro sabor artesanal.
              </p>
              <p>
                Sentimos falta de um lugar simples para achar os produtos feitos com carinho aqui
                da nossa região — e, principalmente, para dar visibilidade a quem produz.
              </p>
              <p>
                Aqui em <strong className="text-foreground">Jardim/MS</strong>, cercados pela
                natureza do Pantanal, reunimos produtores locais que preservam receitas de família
                e o gosto de verdade da roça.
              </p>
            </div>
          </div>

          {/* Values Grid */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {values.map((value, index) => (
                <Card
                  key={index}
                  className="hover:shadow-natural transition-organic border border-border/50 bg-card/50 backdrop-blur-sm"
                >
                  <CardContent className="p-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-lg mb-4">
                      <value.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-2">
                      {value.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {value.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Stats */}
            <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
              <div>
                <div className="text-3xl font-bold text-primary font-artisan">100%</div>
                <div className="text-sm text-muted-foreground">Artesanal</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary font-artisan">Local</div>
                <div className="text-sm text-muted-foreground">Jardim/MS</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-primary font-artisan">Direto</div>
                <div className="text-sm text-muted-foreground">do Produtor</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default About;
