import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Trash2, Pencil, X, LogOut, Store, Package, UserCheck, KeyRound } from "lucide-react";
import { loadProducts, saveProducts, formatPrice, deleteProductFromDatabase, supabase, type Product } from "@/lib/products";
import { loadProducers, createProducerWithAccount, loadProducerByUserId, saveProducer, deleteProducer, type Producer } from "@/lib/producers";
import { useToast } from "@/hooks/use-toast";
import { currentUserIsSuperAdmin } from "@/lib/auth";
import {
  deleteCatalogImages,
  uploadProducerImage,
  uploadProductImages,
  validateImageFile,
  type PendingImage,
} from "@/lib/storage";



const emptyProductForm = {
  id: "",
  name: "",
  price: "",
  originalPrice: "",
  image: [] as string[],
  category: "",
  description: "",
  isNew: false,
  producerId: "",
};

const emptyProducerCreateForm = {
  name: "",
  email: "",
  password: "",
  location: "",
  bio: "",
};

async function cleanupCatalogImages(urls: string[]): Promise<void> {
  try {
    await deleteCatalogImages(urls);
  } catch (error) {
    console.error("Não foi possível remover imagens antigas do Storage:", error);
  }
}

const Admin = () => {
  const { toast } = useToast();
  
  // Estados de Sessão / Usuário Logado
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProducer, setCurrentProducer] = useState<Producer | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  // Login Form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // Dados do Banco
  const [products, setProducts] = useState<Product[]>([]);
  const [producers, setProducers] = useState<Producer[]>([]);

  // Forms
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [producerForm, setProducerForm] = useState(emptyProducerCreateForm);
  const [myStoreForm, setMyStoreForm] = useState<Producer | null>(null);
  const [pendingProductImages, setPendingProductImages] = useState<PendingImage[]>([]);
  const [originalProductImages, setOriginalProductImages] = useState<string[]>([]);
  const [producerCreateImage, setProducerCreateImage] = useState<File | null>(null);
  const [myStoreImage, setMyStoreImage] = useState<File | null>(null);
  
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const fetchData = useCallback(async (userId: string, isSuper: boolean) => {
    if (isSuper) {
      const [allProducts, allProducers] = await Promise.all([
        loadProducts(),
        loadProducers(),
      ]);
      setProducts(allProducts);
      setProducers(allProducers);
    } else {
      setProducers([]);
      const myStore = await loadProducerByUserId(userId);
      if (myStore) {
        const myProducts = await loadProducts(myStore.id);
        setProducts(myProducts);
      } else {
        setProducts([]);
      }
    }
  }, []);

  // Verifica a sessão atual no Supabase Auth
  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setCurrentUser(session.user);

      let isSuper = false;
      try {
        isSuper = await currentUserIsSuperAdmin();
      } catch (error) {
        console.error("Não foi possível consultar o papel protegido do usuário:", error);
      }

      setIsSuperAdmin(isSuper);

      if (!isSuper) {
        const myStore = await loadProducerByUserId(session.user.id);
        setCurrentProducer(myStore);
        setMyStoreForm(myStore);
      }
      fetchData(session.user.id, isSuper);
    } else {
      setCurrentUser(null);
      setCurrentProducer(null);
      setIsSuperAdmin(false);
      setProducts([]);
      setProducers([]);
    }
  }, [fetchData]);

  useEffect(() => {
    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkSession();
    });

    return () => authListener.subscription.unsubscribe();
  }, [checkSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast({ title: "Erro ao entrar", description: "Verifique o e-mail e a senha digitados.", variant: "destructive" });
    } else {
      toast({ title: "Bem-vindo de volta!" });
      checkSession();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentProducer(null);
    setProducts([]);
    setProducers([]);
    setEmail("");
    setPassword("");
    toast({ title: "Sessão encerrada" });
  };

  // --- LÓGICA DE PRODUTOS ---
  const resetProductForm = () => {
    pendingProductImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    setProductForm(emptyProductForm);
    setPendingProductImages([]);
    setOriginalProductImages([]);
    setEditingProductId(null);
  };

  const handleProductImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const files = Array.from(e.target.files ?? []);
      files.forEach(validateImageFile);
      setPendingProductImages((current) => [
        ...current,
        ...files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ]);
      e.target.value = "";
    } catch (error) {
      toast({
        title: "Imagem inválida",
        description: error instanceof Error ? error.message : "Não foi possível selecionar a imagem.",
        variant: "destructive",
      });
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productForm.name || !productForm.price || (productForm.image.length === 0 && pendingProductImages.length === 0) || !productForm.category) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }

    // Se for produtor comum, força a associação com o ID da loja dele
    const targetProducerId = isSuperAdmin ? (productForm.producerId || undefined) : currentProducer?.id;

    const productId = editingProductId ?? crypto.randomUUID();
    let uploadedImages: string[] = [];

    try {
      uploadedImages = await uploadProductImages(
        pendingProductImages.map(({ file }) => file),
        productId,
        targetProducerId ?? null,
      );

      const product: Product = {
        id: productId,
        name: productForm.name,
        price: parseFloat(productForm.price),
        originalPrice: productForm.originalPrice ? parseFloat(productForm.originalPrice) : undefined,
        image: [...productForm.image, ...uploadedImages],
        category: productForm.category,
        description: productForm.description,
        isNew: productForm.isNew,
        producerId: targetProducerId,
      };

      const success = await saveProducts(product);
      if (!success) {
        await cleanupCatalogImages(uploadedImages);
        throw new Error("O banco recusou a alteração do produto.");
      }

      const removedImages = originalProductImages.filter((image) => !productForm.image.includes(image));
      await cleanupCatalogImages(removedImages);
      if (currentUser) fetchData(currentUser.id, isSuperAdmin);
      toast({ title: editingProductId ? "Produto atualizado" : "Produto adicionado" });
      resetProductForm();
    } catch (error) {
      toast({
        title: "Erro ao salvar produto",
        description: error instanceof Error ? error.message : "Não foi possível enviar as imagens.",
        variant: "destructive",
      });
    }
  };

  const handleProductEdit = (p: Product) => {
    pendingProductImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    setPendingProductImages([]);
    setOriginalProductImages(p.image || []);
    setEditingProductId(p.id);
    setProductForm({
      id: p.id,
      name: p.name,
      price: String(p.price),
      originalPrice: p.originalPrice ? String(p.originalPrice) : "",
      image: p.image || [],
      category: p.category,
      description: p.description || "",
      isNew: !!p.isNew,
      producerId: p.producerId || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleProductDelete = async (id: string) => {
    if (!confirm("Remover este produto permanentemente?")) return;
    const success = await deleteProductFromDatabase(id);
    if (success) {
      if (currentUser) fetchData(currentUser.id, isSuperAdmin);
      toast({ title: "Produto removido" });
    } else {
      toast({ title: "Erro ao remover produto", variant: "destructive" });
    }
  };

  // --- LÓGICA DE SUPER ADMIN: CRIAR NOVO PRODUTOR COM CONTA ---
  const handleCreateProducerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!producerForm.name || !producerForm.email || !producerForm.password) {
      toast({ title: "Nome, E-mail e Senha são obrigatórios", variant: "destructive" });
      return;
    }

    const res = await createProducerWithAccount(producerForm);
    if (res.success && res.producer) {
      if (producerCreateImage) {
        let uploadedImage: string | null = null;
        try {
          uploadedImage = await uploadProducerImage(producerCreateImage, res.producer.id);
          const saved = await saveProducer({ ...res.producer, image: uploadedImage });
          if (!saved) throw new Error("A conta foi criada, mas a foto não pôde ser vinculada.");
        } catch (error) {
          if (uploadedImage) await cleanupCatalogImages([uploadedImage]);
          toast({
            title: "Conta criada sem foto",
            description: error instanceof Error ? error.message : "Envie a foto novamente depois.",
            variant: "destructive",
          });
        }
      }
      toast({ title: "Conta e loja criadas com sucesso!" });
      setProducerForm(emptyProducerCreateForm);
      setProducerCreateImage(null);
      form.reset();
      if (currentUser) fetchData(currentUser.id, isSuperAdmin);
    } else {
      toast({ title: "Erro ao criar produtor", description: res.message, variant: "destructive" });
    }
  };

  // --- LÓGICA DO PRODUTOR: EDITAR PRÓPRIA LOJA E SENHA ---
  const handleSaveMyStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myStoreForm) return;

    const previousImage = myStoreForm.image;
    let uploadedImage: string | null = null;
    let updatedStore: Producer | null = null;
    try {
      uploadedImage = myStoreImage
        ? await uploadProducerImage(myStoreImage, myStoreForm.id)
        : null;
      const nextImage = uploadedImage ?? myStoreForm.image;
      updatedStore = { ...myStoreForm, image: nextImage };
      const success = await saveProducer(updatedStore);
      if (!success) throw new Error("O banco recusou a alteração da loja.");
    } catch (error) {
      if (uploadedImage) await cleanupCatalogImages([uploadedImage]);
      toast({
        title: "Erro ao atualizar dados da loja",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
      return;
    }

    if (myStoreImage && previousImage) await cleanupCatalogImages([previousImage]);
    setMyStoreForm(updatedStore);
    setCurrentProducer(updatedStore);
    setMyStoreImage(null);
    toast({ title: "Informações da loja salvas com sucesso!" });
    if (currentUser) fetchData(currentUser.id, isSuperAdmin);
  };

  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sua senha foi alterada com sucesso!" });
      setNewPassword("");
    }
  };

  // TELA DE LOGIN (Se não estiver autenticado)
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-earth px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="font-artisan text-3xl text-foreground">Acesso ao Painel</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Entre com seu e-mail e senha de produtor</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="pw">Senha</Label>
                <Input
                  id="pw"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full">Entrar</Button>
              <Link to="/" className="block text-center text-sm text-muted-foreground hover:text-primary pt-2">
                ← Voltar ao site público
              </Link>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-2" />Ver site</Button>
            </Link>
            <div>
              <h1 className="font-artisan text-xl font-semibold">
                {isSuperAdmin ? "Painel Super Admin" : (currentProducer?.name || "Painel do Produtor")}
              </h1>
              <p className="text-xs text-muted-foreground">{currentUser.email}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="products" className="space-y-8">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Seus Produtos
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              {isSuperAdmin ? <UserCheck className="h-4 w-4" /> : <Store className="h-4 w-4" />}
              {isSuperAdmin ? "Gerenciar Produtores" : "Dados da Sua Loja"}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MEUS PRODUTOS */}
          <TabsContent value="products" className="grid lg:grid-cols-2 gap-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-artisan">
                  {editingProductId ? "Editar produto" : "Adicionar novo produto"}
                </CardTitle>
                {editingProductId && (
                  <Button variant="ghost" size="sm" onClick={resetProductForm}>
                    <X className="h-4 w-4 mr-1" />Cancelar
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProductSubmit} className="space-y-4">
                  <div>
                    <Label>Nome do Produto *</Label>
                    <Input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                  </div>

                  {/* Se for Super Admin, permite escolher para qual produtor vai o produto */}
                  {isSuperAdmin && (
                    <div>
                      <Label>Vincular ao Produtor / Loja</Label>
                      <select
                        value={productForm.producerId}
                        onChange={(e) => setProductForm({ ...productForm, producerId: e.target.value })}
                        className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                      >
                        <option value="">Nenhum / Próprio da Gostudumatu</option>
                        {producers.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Preço (R$) *</Label>
                      <Input type="number" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
                    </div>
                    <div>
                      <Label>Preço original</Label>
                      <Input type="number" step="0.01" value={productForm.originalPrice} onChange={(e) => setProductForm({ ...productForm, originalPrice: e.target.value })} />
                    </div>
                  </div>

                  <div>
                    <Label>Categoria *</Label>
                    <Input value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} placeholder="Ex: Queijos, Mel, Doces..." />
                  </div>

                  <div>
                    <Label>Descrição</Label>
                    <Textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={3} />
                  </div>

                  <div>
                    <Label>Imagens do Produto * (Selecione uma ou mais)</Label>
                    <Input type="file" accept="image/*" multiple onChange={handleProductImageUpload} />
                    {productForm.image && productForm.image.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {productForm.image.map((img, idx) => (
                          <div key={idx} className="relative group">
                            <img src={img} alt="preview" className="w-full h-20 object-cover rounded-md border border-border" />
                            <button
                              type="button"
                              onClick={() => setProductForm(f => ({ ...f, image: f.image.filter((_, i) => i !== idx) }))}
                              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {pendingProductImages.length > 0 && (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {pendingProductImages.map(({ previewUrl }, idx) => (
                          <div key={previewUrl} className="relative group">
                            <img src={previewUrl} alt="Nova imagem" className="w-full h-20 object-cover rounded-md border border-primary/50" />
                            <button
                              type="button"
                              onClick={() => setPendingProductImages((current) => {
                                URL.revokeObjectURL(current[idx].previewUrl);
                                return current.filter((_, imageIndex) => imageIndex !== idx);
                              })}
                              className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={productForm.isNew} onChange={(e) => setProductForm({ ...productForm, isNew: e.target.checked })} />
                    <span className="text-sm">Marcar como novidade</span>
                  </label>

                  <Button type="submit" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    {editingProductId ? "Salvar alterações" : "Cadastrar Produto"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-artisan">Produtos no seu Catálogo ({products.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
                {products.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">Você ainda não possui produtos cadastrados.</p>
                ) : (
                  products.map((p) => (
                    <div key={p.id} className="flex gap-3 p-3 rounded-lg border border-border hover:shadow-soft transition-organic">
                      <img src={p.image && p.image[0] ? p.image[0] : ""} alt={p.name} className="w-16 h-16 object-cover rounded-md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium truncate">{p.name}</h4>
                          {p.isNew && <Badge className="bg-primary text-primary-foreground text-xs">Novo</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.category}</p>
                        <p className="text-primary font-semibold text-sm">{formatPrice(p.price)}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button size="icon" variant="ghost" onClick={() => handleProductEdit(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleProductDelete(p.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: CONFIGURAÇÕES DA LOJA OU SUPER ADMIN */}
          <TabsContent value="settings" className="space-y-8">
            {isSuperAdmin ? (
              /* VISÃO DO SUPER ADMIN: CRIAR NOVAS CONTAS DE PRODUTORES */
              <div className="grid lg:grid-cols-2 gap-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-artisan">Cadastrar Novo Produtor (Gerar Acesso)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateProducerAccount} className="space-y-4">
                      <div>
                        <Label>Nome do Produtor / Sítio *</Label>
                        <Input 
                          value={producerForm.name} 
                          onChange={(e) => setProducerForm({ ...producerForm, name: e.target.value })} 
                          placeholder="Ex: Sítio Vista Alegre" 
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>E-mail de Acesso *</Label>
                          <Input 
                            type="email"
                            value={producerForm.email} 
                            onChange={(e) => setProducerForm({ ...producerForm, email: e.target.value })} 
                            placeholder="produtor@email.com" 
                            required
                          />
                        </div>
                        <div>
                          <Label>Senha Inicial *</Label>
                          <Input 
                            type="password"
                            value={producerForm.password} 
                            onChange={(e) => setProducerForm({ ...producerForm, password: e.target.value })} 
                            placeholder="••••••••" 
                            minLength={8}
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Localização</Label>
                        <Input 
                          value={producerForm.location} 
                          onChange={(e) => setProducerForm({ ...producerForm, location: e.target.value })} 
                          placeholder="Ex: Zona Rural, Jardim/MS" 
                        />
                      </div>

                      <div>
                        <Label>História do Produtor</Label>
                        <Textarea 
                          value={producerForm.bio} 
                          onChange={(e) => setProducerForm({ ...producerForm, bio: e.target.value })} 
                          rows={3}
                        />
                      </div>

                      <div>
                        <Label>Foto do Produtor ou Propriedade</Label>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            if (!file) return;
                            try {
                              validateImageFile(file);
                              setProducerCreateImage(file);
                            } catch (error) {
                              e.target.value = "";
                              setProducerCreateImage(null);
                              toast({
                                title: "Imagem inválida",
                                description: error instanceof Error ? error.message : undefined,
                                variant: "destructive",
                              });
                            }
                          }}
                        />
                        {producerCreateImage && (
                          <p className="mt-1 text-xs text-muted-foreground">{producerCreateImage.name}</p>
                        )}
                      </div>

                      <Button type="submit" className="w-full">
                        <Plus className="h-4 w-4 mr-2" />
                        Criar Produtor e Liberar Login
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="font-artisan">Produtores Cadastrados ({producers.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {producers.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div>
                          <h4 className="font-medium">{p.name}</h4>
                          <p className="text-xs text-muted-foreground">{p.location || "Sem local"}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteProducer(p.id).then(() => checkSession())}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              /* VISÃO DO PRODUTOR COMUM: EDITAR SUAS PRÓPRIAS INFORMAÇÕES E SENHA */
              <div className="grid lg:grid-cols-2 gap-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="font-artisan">Dados do Seu Sítio / Loja</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {myStoreForm ? (
                      <form onSubmit={handleSaveMyStore} className="space-y-4">
                        <div>
                          <Label>Nome da Propriedade / Loja</Label>
                          <Input 
                            value={myStoreForm.name} 
                            onChange={(e) => setMyStoreForm({ ...myStoreForm, name: e.target.value })} 
                          />
                        </div>

                        <div>
                          <Label>Localização</Label>
                          <Input 
                            value={myStoreForm.location || ""} 
                            onChange={(e) => setMyStoreForm({ ...myStoreForm, location: e.target.value })} 
                          />
                        </div>

                        <div>
                          <Label>Sua História / Biografia</Label>
                          <Textarea 
                            value={myStoreForm.bio || ""} 
                            onChange={(e) => setMyStoreForm({ ...myStoreForm, bio: e.target.value })} 
                            rows={4}
                          />
                        </div>

                        <div>
                          <Label>Foto do Produtor ou Propriedade</Label>
                          <Input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (!file) return;
                              try {
                                validateImageFile(file);
                                setMyStoreImage(file);
                              } catch (error) {
                                e.target.value = "";
                                setMyStoreImage(null);
                                toast({
                                  title: "Imagem inválida",
                                  description: error instanceof Error ? error.message : undefined,
                                  variant: "destructive",
                                });
                              }
                            }} 
                          />
                          {myStoreImage && (
                            <p className="mt-1 text-xs text-muted-foreground">Nova foto: {myStoreImage.name}</p>
                          )}
                          {myStoreForm.image && (
                            <img src={myStoreForm.image} alt="preview" className="mt-2 w-24 h-24 object-cover rounded-md" />
                          )}
                        </div>

                        <Button type="submit" className="w-full">Salvar Dados da Loja</Button>
                      </form>
                    ) : (
                      <p className="text-muted-foreground text-sm">Sua conta ainda não possui uma loja associada.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Bloco de Trocar Senha */}
                <Card>
                  <CardHeader>
                    <CardTitle className="font-artisan flex items-center gap-2">
                      <KeyRound className="h-5 w-5 text-primary" /> Alterar Sua Senha
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleChangeMyPassword} className="space-y-4">
                      <div>
                        <Label>Nova Senha</Label>
                        <Input 
                          type="password" 
                          placeholder="Digite a nova senha" 
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <Button type="submit" variant="outline" className="w-full">
                        Atualizar Senha
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
