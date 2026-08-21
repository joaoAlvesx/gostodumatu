import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import logo from "@/assets/logo.svg";

type AuthCardLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export default function AuthCardLayout({ title, description, children }: AuthCardLayoutProps) {
  return (
    <main className="min-h-screen bg-gradient-earth px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> Voltar ao catálogo
        </Link>
        <Card className="shadow-warm">
          <CardHeader className="items-center text-center">
            <img src={logo} alt="Gostudumatu" className="mb-2 h-16 w-auto" />
            <CardTitle className="font-artisan text-3xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
