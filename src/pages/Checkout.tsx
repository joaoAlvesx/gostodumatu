import { useEffect, useMemo, useRef, useState } from "react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Copy,
  LoaderCircle,
  MapPin,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/hooks/use-toast";
import {
  CheckoutApiError,
  createCardPayment,
  createCheckoutSession,
  createPixPayment,
  refreshPayment,
  requestShippingQuote,
  type CheckoutSession,
  type PaymentResult,
  type ShippingQuote,
  type ShippingSelection,
} from "@/lib/checkout";
import {
  formatCents,
  loadCustomerAddresses,
  loadCustomerProfile,
  type CustomerAddress,
  type CustomerProfile,
} from "@/lib/customer";

type CardFormData = {
  token: string;
  payment_method_id: string;
  installments: number;
};

type CardAdditionalData = { paymentTypeId?: string };

type StoredCheckout = { session: CheckoutSession; payment: PaymentResult | null };

function storedCheckout(customerId: string): StoredCheckout | null {
  try {
    const raw = sessionStorage.getItem(`gostodumatu:checkout:${customerId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as StoredCheckout;
    return value?.session?.order?.id ? value : null;
  } catch {
    return null;
  }
}

function apiMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Tente novamente em alguns instantes.";
}

function profileIsComplete(profile: CustomerProfile | null): boolean {
  if (!profile) return false;
  const phone = (profile.phone ?? "").replace(/\D/g, "");
  const taxId = (profile.tax_id ?? "").replace(/\D/g, "");
  return Boolean(profile.full_name?.trim()) && phone.length >= 10 && [11, 14].includes(taxId.length);
}

function addressText(address: CustomerAddress): string {
  return `${address.street}, ${address.number}${address.complement ? ` — ${address.complement}` : ""}, ${address.neighborhood}, ${address.city}/${address.state} — CEP ${address.postal_code}`;
}

function paymentMessage(result: PaymentResult): { title: string; description: string; variant: "default" | "destructive" } {
  if (result.orderStatus === "paid") {
    return { title: "Pagamento confirmado", description: "Seu pedido foi recebido e o envio será preparado.", variant: "default" };
  }
  if (result.orderStatus === "refunded") {
    return { title: "Pagamento estornado", description: "O estoque mudou e o valor foi devolvido automaticamente.", variant: "destructive" };
  }
  if (result.orderStatus === "payment_failed") {
    return { title: "Pagamento não aprovado", description: "Confira os dados ou tente outra forma de pagamento.", variant: "destructive" };
  }
  return { title: "Pagamento criado", description: "Aguardando a confirmação do Mercado Pago.", variant: "default" };
}

export default function Checkout() {
  const { items, clear } = useCart();
  const { toast } = useToast();
  const checkoutKey = useRef(crypto.randomUUID());
  const pixKey = useRef(crypto.randomUUID());
  const clearedOrder = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"quote" | "checkout" | "pix" | "card" | "status" | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  const [quote, setQuote] = useState<ShippingQuote | null>(null);
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const paymentAttemptId = payment?.paymentAttemptId;
  const paymentOrderStatus = payment?.orderStatus;

  const selectedAddress = addresses.find((address) => address.id === addressId) ?? null;
  const selectedShippingCents = useMemo(() => quote?.groups.reduce((total, group) => {
    const serviceId = selections[group.producerId];
    return total + (group.options.find((option) => option.serviceId === serviceId)?.priceCents ?? 0);
  }, 0) ?? 0, [quote, selections]);
  const hasAllShippingSelections = Boolean(quote?.groups.length)
    && quote!.groups.every((group) => Number.isInteger(selections[group.producerId]));

  useEffect(() => {
    let active = true;
    Promise.all([loadCustomerProfile(), loadCustomerAddresses()])
      .then(([nextProfile, nextAddresses]) => {
        if (!active) return;
        setProfile(nextProfile);
        setAddresses(nextAddresses);
        setAddressId(nextAddresses.find((address) => address.is_default)?.id ?? nextAddresses[0]?.id ?? "");
        const stored = storedCheckout(nextProfile.id);
        if (stored) {
          setSession(stored.session);
          setPayment(stored.payment);
        }
      })
      .catch((error) => {
        if (active) toast({ title: "Não foi possível carregar seus dados", description: apiMessage(error), variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  useEffect(() => {
    if (!session?.publicKey) return;
    initMercadoPago(session.publicKey, { locale: "pt-BR", advancedFraudPrevention: true });
  }, [session?.publicKey]);

  useEffect(() => {
    if (!profile || !session) return;
    sessionStorage.setItem(
      `gostodumatu:checkout:${profile.id}`,
      JSON.stringify({ session, payment } satisfies StoredCheckout),
    );
  }, [payment, profile, session]);

  useEffect(() => {
    if (!paymentAttemptId || !session || paymentOrderStatus !== "awaiting_payment") return;
    let active = true;
    const timer = window.setInterval(() => {
      void refreshPayment({ orderId: session.order.id, paymentAttemptId })
        .then((next) => { if (active) setPayment(next); })
        .catch(() => undefined);
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [paymentAttemptId, paymentOrderStatus, session]);

  useEffect(() => {
    if (
      !session
      || !payment
      || !["paid", "refunded"].includes(payment.orderStatus)
      || clearedOrder.current === session.order.id
    ) return;
    clearedOrder.current = session.order.id;
    if (profile) sessionStorage.removeItem(`gostodumatu:checkout:${profile.id}`);
    clear();
  }, [clear, payment, profile, session]);

  const resetQuote = (nextAddressId: string) => {
    setAddressId(nextAddressId);
    setQuote(null);
    setSelections({});
    checkoutKey.current = crypto.randomUUID();
  };

  const calculateShipping = async () => {
    if (!selectedAddress || items.length === 0) return;
    setBusy("quote");
    try {
      const next = await requestShippingQuote({
        postalCode: selectedAddress.postal_code,
        items: items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      });
      setQuote(next);
      setSelections(Object.fromEntries(next.groups.map((group) => [group.producerId, group.options[0]?.serviceId])));
    } catch (error) {
      toast({ title: "Não foi possível calcular o frete", description: apiMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const confirmCheckout = async () => {
    if (!quote || !selectedAddress || !hasAllShippingSelections) return;
    setBusy("checkout");
    try {
      const selected = quote.groups.map<ShippingSelection>((group) => ({
        producerId: group.producerId,
        serviceId: selections[group.producerId],
      }));
      const next = await createCheckoutSession({
        quoteSessionId: quote.quoteSessionId,
        addressId: selectedAddress.id,
        idempotencyKey: checkoutKey.current,
        selections: selected,
      });
      setSession(next);
    } catch (error) {
      if (error instanceof CheckoutApiError && ["QUOTE_CHANGED", "QUOTE_EXPIRED"].includes(error.code)) {
        setQuote(null);
        setSelections({});
      }
      toast({ title: "Não foi possível reservar o pedido", description: apiMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const applyPayment = (next: PaymentResult) => {
    setPayment(next);
    const message = paymentMessage(next);
    toast({ title: message.title, description: message.description, variant: message.variant });
  };

  const payWithPix = async () => {
    if (!session) return;
    setBusy("pix");
    try {
      applyPayment(await createPixPayment({ orderId: session.order.id, idempotencyKey: pixKey.current }));
    } catch (error) {
      if (error instanceof CheckoutApiError && error.code === "CHECKOUT_EXPIRED") restartCheckout();
      toast({ title: "Não foi possível gerar o Pix", description: apiMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const payWithCard = async (formData: CardFormData, additionalData?: CardAdditionalData) => {
    if (!session) return;
    setBusy("card");
    try {
      const paymentTypeId = additionalData?.paymentTypeId;
      if (!paymentTypeId) throw new Error("O Mercado Pago não informou o tipo do cartão.");
      applyPayment(await createCardPayment({
        orderId: session.order.id,
        idempotencyKey: crypto.randomUUID(),
        card: {
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          paymentTypeId,
          installments: formData.installments,
        },
      }));
    } catch (error) {
      if (error instanceof CheckoutApiError && error.code === "CHECKOUT_EXPIRED") restartCheckout();
      toast({ title: "Não foi possível processar o cartão", description: apiMessage(error), variant: "destructive" });
      throw error;
    } finally {
      setBusy(null);
    }
  };

  const checkPayment = async () => {
    if (!session || !payment) return;
    setBusy("status");
    try {
      applyPayment(await refreshPayment({ orderId: session.order.id, paymentAttemptId: payment.paymentAttemptId }));
    } catch (error) {
      toast({ title: "Não foi possível consultar o pagamento", description: apiMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyPix = async () => {
    if (!payment?.payment.qrCode) return;
    await navigator.clipboard.writeText(payment.payment.qrCode);
    toast({ title: "Código Pix copiado" });
  };

  const restartCheckout = () => {
    if (profile) sessionStorage.removeItem(`gostodumatu:checkout:${profile.id}`);
    setSession(null);
    setPayment(null);
    setQuote(null);
    setSelections({});
    checkoutKey.current = crypto.randomUUID();
    pixKey.current = crypto.randomUUID();
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const finished = payment && ["paid", "refunded"].includes(payment.orderStatus);
  const paymentExpired = payment && ["expired", "cancelled"].includes(payment.orderStatus);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">Compra segura</p>
          <h1 className="font-artisan text-3xl font-bold sm:text-4xl">Finalizar pedido</h1>
        </div>

        {!session && items.length === 0 ? (
          <Card className="mx-auto max-w-xl text-center">
            <CardHeader><CardTitle>Seu carrinho está vazio</CardTitle><CardDescription>Escolha seus produtos antes de iniciar o checkout.</CardDescription></CardHeader>
            <CardContent><Button asChild><Link to="/">Ver produtos</Link></Button></CardContent>
          </Card>
        ) : !profileIsComplete(profile) ? (
          <Alert variant="destructive" className="mx-auto max-w-2xl">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Complete seus dados pessoais</AlertTitle>
            <AlertDescription className="space-y-3"><p>Nome, telefone e CPF/CNPJ são necessários para emitir o pagamento.</p><Button asChild variant="outline"><Link to="/minha-conta">Ir para Minha conta</Link></Button></AlertDescription>
          </Alert>
        ) : addresses.length === 0 ? (
          <Alert className="mx-auto max-w-2xl">
            <MapPin className="h-4 w-4" />
            <AlertTitle>Cadastre um endereço</AlertTitle>
            <AlertDescription className="space-y-3"><p>Precisamos do destino para calcular o frete.</p><Button asChild variant="outline"><Link to="/minha-conta">Cadastrar endereço</Link></Button></AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <div className="space-y-6">
              {!session && (
                <>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2 font-artisan"><MapPin className="h-5 w-5 text-primary" />Endereço de entrega</CardTitle></CardHeader>
                    <CardContent>
                      <RadioGroup value={addressId} onValueChange={resetQuote} className="space-y-3">
                        {addresses.map((address) => (
                          <Label key={address.id} htmlFor={`address-${address.id}`} className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-muted/30">
                            <RadioGroupItem id={`address-${address.id}`} value={address.id} className="mt-1" />
                            <span><span className="flex items-center gap-2 font-medium">{address.label}{address.is_default && <Badge variant="secondary">Principal</Badge>}</span><span className="mt-1 block text-sm font-normal text-muted-foreground">{addressText(address)}</span></span>
                          </Label>
                        ))}
                      </RadioGroup>
                      <Button onClick={calculateShipping} disabled={!addressId || busy !== null} className="mt-4">
                        {busy === "quote" ? <LoaderCircle className="animate-spin" /> : <Truck />} {quote ? "Recalcular frete" : "Calcular frete"}
                      </Button>
                    </CardContent>
                  </Card>

                  {quote && (
                    <Card>
                      <CardHeader><CardTitle className="flex items-center gap-2 font-artisan"><Truck className="h-5 w-5 text-primary" />Opções de envio</CardTitle><CardDescription>Há uma remessa separada para cada produtor.</CardDescription></CardHeader>
                      <CardContent className="space-y-6">
                        {quote.groups.map((group) => (
                          <div key={group.producerId} className="space-y-3">
                            <div><h3 className="font-semibold">{group.producerName}</h3><p className="text-sm text-muted-foreground">{group.items.map((item) => `${item.quantity}x ${item.name}`).join(", ")}</p></div>
                            <RadioGroup value={String(selections[group.producerId] ?? "")} onValueChange={(value) => setSelections((current) => ({ ...current, [group.producerId]: Number(value) }))}>
                              {group.options.map((option) => (
                                <Label key={option.serviceId} htmlFor={`shipping-${group.producerId}-${option.serviceId}`} className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-muted/30">
                                  <RadioGroupItem id={`shipping-${group.producerId}-${option.serviceId}`} value={String(option.serviceId)} />
                                  <span className="min-w-0 flex-1"><span className="block font-medium">{option.carrier.name} — {option.serviceName}</span><span className="text-sm font-normal text-muted-foreground">{option.deliveryDays === null ? "Prazo informado após a postagem" : `Até ${option.deliveryDays} dias úteis`}</span></span>
                                  <span className="font-semibold text-primary">{formatCents(option.priceCents)}</span>
                                </Label>
                              ))}
                            </RadioGroup>
                          </div>
                        ))}
                        <Button onClick={confirmCheckout} disabled={!hasAllShippingSelections || busy !== null} size="lg" className="w-full">
                          {busy === "checkout" ? <LoaderCircle className="animate-spin" /> : <PackageCheck />} Reservar e ir para pagamento
                        </Button>
                        <p className="text-center text-xs text-muted-foreground">O frete será conferido novamente antes de reservar o estoque.</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {session && !finished && !paymentExpired && (
                <Card>
                  <CardHeader><CardTitle className="font-artisan">Pagamento</CardTitle><CardDescription>Pedido #{session.order.number}. A reserva expira às {new Date(session.order.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</CardDescription></CardHeader>
                  <CardContent>
                    {payment?.orderStatus === "payment_failed" && (
                      <Alert variant="destructive" className="mb-4"><AlertCircle className="h-4 w-4" /><AlertTitle>Pagamento não aprovado</AlertTitle><AlertDescription>Você pode tentar novamente com outro cartão enquanto a reserva estiver ativa.</AlertDescription></Alert>
                    )}
                    <Tabs defaultValue="pix">
                      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="pix">Pix</TabsTrigger><TabsTrigger value="card">Cartão</TabsTrigger></TabsList>
                      <TabsContent value="pix" className="pt-4">
                        {payment?.payment.paymentMethod === "pix" && payment.payment.qrCode ? (
                          <div className="space-y-4 text-center">
                            <div className="mx-auto w-fit rounded-xl border bg-white p-4"><QRCodeSVG value={payment.payment.qrCode} size={220} level="M" /></div>
                            <p className="text-sm text-muted-foreground">Leia o QR Code no aplicativo do seu banco ou copie o código.</p>
                            <div className="flex flex-col justify-center gap-2 sm:flex-row"><Button onClick={copyPix}><Copy />Copiar Pix</Button><Button variant="outline" onClick={checkPayment} disabled={busy !== null}>{busy === "status" ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Verificar pagamento</Button></div>
                            {payment.payment.ticketUrl && <a className="text-sm text-primary underline" href={payment.payment.ticketUrl} target="_blank" rel="noreferrer">Abrir instruções do Mercado Pago</a>}
                          </div>
                        ) : (
                          <div className="space-y-4"><p className="text-sm text-muted-foreground">O QR Code será válido durante o período da reserva.</p><Button onClick={payWithPix} disabled={busy !== null} className="w-full" size="lg">{busy === "pix" ? <LoaderCircle className="animate-spin" /> : null}Gerar QR Code Pix</Button></div>
                        )}
                      </TabsContent>
                      <TabsContent value="card" className="pt-4">
                        {payment?.payment.challengeUrl ? (
                          <div className="space-y-3"><Alert><Clock3 className="h-4 w-4" /><AlertTitle>Confirme com seu banco</AlertTitle><AlertDescription>Conclua a autenticação abaixo. A confirmação será consultada automaticamente.</AlertDescription></Alert><iframe title="Autenticação do cartão" src={payment.payment.challengeUrl} className="h-[520px] w-full rounded-lg border" /></div>
                        ) : (
                          <div className={busy === "card" ? "pointer-events-none opacity-70" : ""}>
                            <CardPayment
                              initialization={{ amount: session.order.totalCents / 100, payer: { email: profile?.email ?? undefined, identification: { type: (profile?.tax_id ?? "").replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF", number: (profile?.tax_id ?? "").replace(/\D/g, "") } } }}
                              customization={{ paymentMethods: { minInstallments: 1, maxInstallments: 12, types: { included: ["credit_card", "debit_card", "prepaid_card"] } } }}
                              locale="pt-BR"
                              onSubmit={payWithCard}
                              onError={() => toast({ title: "Não foi possível carregar o formulário do cartão", variant: "destructive" })}
                            />
                          </div>
                        )}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}

              {session && paymentExpired && (
                <Card>
                  <CardContent className="space-y-4 py-8 text-center">
                    <Clock3 className="mx-auto h-12 w-12 text-muted-foreground" />
                    <div><h2 className="font-artisan text-2xl font-bold">A reserva expirou</h2><p className="mt-2 text-muted-foreground">Os produtos voltaram ao estoque. Calcule o frete novamente para criar outro pedido.</p></div>
                    <Button onClick={restartCheckout}>Refazer checkout</Button>
                  </CardContent>
                </Card>
              )}

              {session && finished && (
                <Card className="border-primary/30 text-center">
                  <CardContent className="space-y-4 py-10">
                    {payment.orderStatus === "paid" ? <CheckCircle2 className="mx-auto h-14 w-14 text-primary" /> : <AlertCircle className="mx-auto h-14 w-14 text-destructive" />}
                    <div><h2 className="font-artisan text-2xl font-bold">{payment.orderStatus === "paid" ? "Pedido confirmado!" : "Pagamento devolvido"}</h2><p className="mt-2 text-muted-foreground">{payment.orderStatus === "paid" ? "Você pode acompanhar a preparação e o envio em Minha conta." : "Não havia mais estoque disponível quando o pagamento foi confirmado."}</p></div>
                    <Button asChild><Link to={`/minha-conta/pedidos/${session.order.id}`}>Acompanhar pedido</Link></Button>
                  </CardContent>
                </Card>
              )}
            </div>

            <aside>
              <Card className="lg:sticky lg:top-24">
                <CardHeader><CardTitle className="font-artisan">Resumo</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {items.length > 0 && <div className="space-y-3">{items.map((item) => <div key={item.product.id} className="flex justify-between gap-3 text-sm"><span>{item.quantity}x {item.product.name}</span><span className="shrink-0">{formatCents(Math.round(item.product.price * item.quantity * 100))}</span></div>)}</div>}
                  <div className="space-y-2 border-t pt-4 text-sm">
                    <div className="flex justify-between"><span>Produtos</span><span>{formatCents(session?.order.subtotalCents ?? Math.round(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0) * 100))}</span></div>
                    <div className="flex justify-between"><span>Frete</span><span>{quote || session ? formatCents(session?.order.shippingCents ?? selectedShippingCents) : "A calcular"}</span></div>
                    <div className="flex justify-between border-t pt-3 text-lg font-bold"><span>Total</span><span className="text-primary">{formatCents(session?.order.totalCents ?? Math.round(items.reduce((sum, item) => sum + item.product.price * item.quantity, 0) * 100) + selectedShippingCents)}</span></div>
                  </div>
                  {session && !finished && !paymentExpired && <Alert><Clock3 className="h-4 w-4" /><AlertTitle>Estoque reservado</AlertTitle><AlertDescription>Conclua o pagamento até {new Date(session.order.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</AlertDescription></Alert>}
                </CardContent>
              </Card>
            </aside>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
