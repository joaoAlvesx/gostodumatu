import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet";
import { Menu, ShoppingCart, Heart } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import logoHeader from "@/assets/logo.svg";

const navLinks = [
  { href: "/#produtores", label: "Produtores" },
  { href: "/#produtos", label: "Produtos" },
  { href: "/#sobre", label: "Sobre Nós" },
];

const Header = () => {
  const cart = useCart();
  const { wishlist, openWishlist } = useWishlist();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 768 : true
  );

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const totalCount =
    cart?.totalItems ??
    cart?.items?.reduce((acc, item) => acc + (item.quantity || 1), 0) ??
    0;

  const wishlistCount = wishlist.length;

  const handleNavClick = () => setMobileOpen(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center gap-2">
        {/* ===== MOBILE (<768px) ===== */}
        {!isDesktop && (
          <>
            {/* Hambúrguer - esquerda */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label="Abrir menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[280px] sm:w-[320px] p-0 flex flex-col"
              >
                <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
                <div className="flex items-center space-x-2 px-5 h-16 border-b border-border/50">
                  <img
                    src={logoHeader}
                    alt="Emblema Gostudumatu"
                    className="h-9 w-auto object-contain"
                  />
                  <span className="font-artisan text-xl font-bold text-foreground">
                    Gosto<span className="text-primary">dumatu</span>
                  </span>
                </div>
                <nav className="flex flex-col py-4 px-3 gap-1">
                  {navLinks.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <a
                        href={link.href}
                        onClick={handleNavClick}
                        className="flex items-center px-4 py-3 rounded-md text-base font-medium text-foreground/80 hover:bg-muted hover:text-primary transition-colors"
                      >
                        {link.label}
                      </a>
                    </SheetClose>
                  ))}
                </nav>
                <div className="mt-auto px-5 py-4 border-t border-border/50 text-xs text-muted-foreground">
                  © {new Date().getFullYear()} Gostudumatu
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo + Brand - centro absoluto */}
            <Link
              to="/"
              className="flex items-center space-x-2 group shrink-0 absolute left-1/2 -translate-x-1/2"
            >
              <img
                src={logoHeader}
                alt="Emblema Gostudumatu"
                className="h-9 w-auto object-contain -ml-2 transition-transform group-hover:scale-105"
              />
              <span className="font-artisan text-lg font-bold text-foreground whitespace-nowrap">
                Gosto<span className="text-primary">dumatu</span>
              </span>
            </Link>

            {/* Ações - direita */}
            <div className="flex items-center space-x-2 ml-auto shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="relative"
                onClick={openWishlist}
                aria-label="Abrir favoritos"
              >
                <Heart
                  className={`h-5 w-5 transition-colors ${
                    wishlistCount > 0 ? "text-red-500 fill-red-500" : ""
                  }`}
                />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white animate-in zoom-in-50">
                    {wishlistCount}
                  </span>
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="relative"
                onClick={() => cart?.openCart()}
                aria-label="Abrir carrinho"
              >
                <ShoppingCart className="h-5 w-5" />
                {totalCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground animate-in zoom-in-50">
                    {totalCount}
                  </span>
                )}
              </Button>
            </div>
          </>
        )}

        {/* ===== DESKTOP (>=768px) ===== */}
        {isDesktop && (
          <>
            {/* Logo + Brand - esquerda */}
            <Link
              to="/"
              className="flex items-center space-x-2 group shrink-0"
            >
              <img
                src={logoHeader}
                alt="Emblema Gostudumatu"
                className="h-12 w-auto object-contain -ml-6 transition-transform group-hover:scale-105"
              />
              <span className="font-artisan text-2xl font-bold text-foreground whitespace-nowrap">
                Gosto<span className="text-primary">dumatu</span>
              </span>
            </Link>

            {/* Nav centralizada (absoluta no meio) */}
            <nav className="flex items-center space-x-8 text-sm font-medium absolute left-1/2 -translate-x-1/2">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-primary text-foreground/80"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Ações - direita */}
            <div className="flex items-center space-x-3 ml-auto shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="relative"
                onClick={openWishlist}
                aria-label="Abrir favoritos"
              >
                <Heart
                  className={`h-5 w-5 transition-colors ${
                    wishlistCount > 0 ? "text-red-500 fill-red-500" : ""
                  }`}
                />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white animate-in zoom-in-50">
                    {wishlistCount}
                  </span>
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                className="relative"
                onClick={() => cart?.openCart()}
                aria-label="Abrir carrinho"
              >
                <ShoppingCart className="h-5 w-5" />
                {totalCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground animate-in zoom-in-50">
                    {totalCount}
                  </span>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default Header;
