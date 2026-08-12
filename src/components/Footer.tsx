import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Facebook, 
  Instagram, 
  Mail, 
  MapPin, 
  Phone, 
  MessageCircle 
} from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-earth border-t border-border">
      <div className="container mx-auto px-4 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-2xl font-artisan font-bold text-foreground">
              Gostodumatu
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Comida artesanal feita por produtores locais de Jardim/MS. Do produtor
              direto pra sua mesa, com o sabor de verdade da roça.
            </p>
            <div className="flex items-center space-x-3">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <Facebook className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <Instagram className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                <MessageCircle className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Navegação</h4>
            <div className="space-y-2">
              <a href="#home" className="block text-muted-foreground hover:text-primary transition-organic">
                Início
              </a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">
                Produtos
              </a>
              <a href="#sobre" className="block text-muted-foreground hover:text-primary transition-organic">
                Nossa História
              </a>
              <a href="#contato" className="block text-muted-foreground hover:text-primary transition-organic">
                Contato
              </a>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Categorias</h4>
            <div className="space-y-2">
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Mel</a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Doce de Leite</a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Queijos</a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Geleias e Compotas</a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Rapadura e Melado</a>
              <a href="#produtos" className="block text-muted-foreground hover:text-primary transition-organic">Bebidas Artesanais</a>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Contato</h4>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm">Jardim, MS - Brasil</span>
              </div>
              <div className="flex items-center space-x-3 text-muted-foreground">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-sm">(67) 99685-0272</span>
              </div>
              <div className="flex items-center space-x-3 text-muted-foreground">
                <Mail className="h-4 w-4 text-primary" />
                <span className="text-sm">contato@gostudumatu.com.br</span>
              </div>
            </div>
            
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 gap-2 text-center md:text-left">
          <div className="text-sm text-muted-foreground">
            © {currentYear} Gostodumatu. Todos os direitos reservados.
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-organic">
              Política de Privacidade
            </a>
            <a href="#" className="hover:text-primary transition-organic">
              Termos de Uso
            </a>
            <a href="#" className="hover:text-primary transition-organic">
              Trocas e Devoluções
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;