// src/App.tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { AuthProvider } from "@/context/AuthContext";
import CartDrawer from "@/components/CartDrawer";
import WishlistDrawer from "@/components/WishlistDrawer";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import ProducerDetail from "./pages/ProducerDetail";
import NotFound from "./pages/NotFound";
import CustomerAuth from "./pages/CustomerAuth";
import ForgotPassword from "./pages/ForgotPassword";
import AuthCallback from "./pages/AuthCallback";
import UpdatePassword from "./pages/UpdatePassword";
import CustomerAccount from "./pages/CustomerAccount";
import CustomerOrders from "./pages/CustomerOrders";
import CustomerOrderDetail from "./pages/CustomerOrderDetail";
import Checkout from "./pages/Checkout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <CartDrawer />
              <WishlistDrawer />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/produtor/:slug" element={<ProducerDetail />} />
                <Route path="/entrar" element={<CustomerAuth mode="login" />} />
                <Route path="/cadastro" element={<CustomerAuth mode="signup" />} />
                <Route path="/recuperar-senha" element={<ForgotPassword />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/atualizar-senha" element={<ProtectedRoute><UpdatePassword /></ProtectedRoute>} />
                <Route path="/minha-conta" element={<ProtectedRoute><CustomerAccount /></ProtectedRoute>} />
                <Route path="/minha-conta/pedidos" element={<ProtectedRoute><CustomerOrders /></ProtectedRoute>} />
                <Route path="/minha-conta/pedidos/:id" element={<ProtectedRoute><CustomerOrderDetail /></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
