import { Button } from "@/components/ui/button";
import { ArrowRight, Heart } from "lucide-react";
import heroImage from "@/assets/hero-pantanal.jpg";

const Hero = () => {
  // Função para rolar suavemente até as seções
  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section id="home" className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ 
          backgroundImage: `url(${heroImage})`,
          filter: "brightness(0.7)"
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/50 via-foreground/30 to-transparent" />
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6 sm:mb-8 backdrop-blur-sm">
            <Heart className="h-4 w-4" />
            <span className="text-xs sm:text-sm font-medium">Feito com amor no coração do Pantanal</span>
          </div>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-artisan font-bold text-background mb-6 leading-tight">
            Sabor que
            <span className="block text-primary"> Vem da Roça</span>
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-xl md:text-2xl text-background/90 mb-10 sm:mb-12 max-w-2xl mx-auto leading-relaxed px-2 sm:px-0">
            Mel, queijos, doces e outras delícias artesanais do Mato Grosso do Sul.
            Do produtor direto pra sua mesa.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-6 px-4 sm:px-0">
            {/* Botão 1: Explorar Produtos */}
            <Button 
              size="lg" 
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-base sm:text-lg font-medium shadow-warm transition-organic w-full sm:w-auto"
              onClick={() => handleScrollTo("produtos")}
            >
              Explorar Produtos
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            
            <Button 
              variant="outline" 
              size="lg"
              className="border-background text-black bg-background px-8 py-4 text-base sm:text-lg font-medium backdrop-blur-sm transition-organic w-full sm:w-auto"
              onClick={() => handleScrollTo("produtores")}
            >
              Conhecer Produtores
            </Button>
          </div>

          {/* Features */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 sm:space-x-8 gap-y-2 mt-12 sm:mt-16 px-2 text-background/80">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span className="text-xs sm:text-sm">100% Artesanal</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span className="text-xs sm:text-sm">Materiais Naturais</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-primary rounded-full"></span>
              <span className="text-xs sm:text-sm">Direto do Produtor</span>
            </div>
          </div>
        </div>
      </div>

        
    </section>
  );
};

export default Hero;