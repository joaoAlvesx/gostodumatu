import { useEffect, useState, type FormEvent } from "react";
import { Check, LoaderCircle, MapPin, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CustomerAccountNavigation from "@/components/CustomerAccountNavigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  deleteCustomerAddress,
  loadCustomerAddresses,
  loadCustomerProfile,
  saveCustomerAddress,
  updateCustomerProfile,
  type CustomerAddress,
  type CustomerAddressForm,
} from "@/lib/customer";

const EMPTY_ADDRESS: CustomerAddressForm = {
  label: "Casa",
  recipient_name: "",
  recipient_phone: "",
  postal_code: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "MS",
  is_default: false,
};

export default function CustomerAccount() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressForm, setAddressForm] = useState<CustomerAddressForm | null>(null);

  const refresh = async () => {
    const [profile, nextAddresses] = await Promise.all([
      loadCustomerProfile(),
      loadCustomerAddresses(),
    ]);
    setFullName(profile.full_name ?? "");
    setPhone(profile.phone ?? "");
    setTaxId(profile.tax_id ?? "");
    setEmail(profile.email ?? "");
    setAddresses(nextAddresses);
  };

  useEffect(() => {
    let active = true;
    void refresh()
      .catch((error) => {
        if (active) toast({ title: "Não foi possível carregar sua conta", description: error.message, variant: "destructive" });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [toast]);

  const handleProfileSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      await updateCustomerProfile({ fullName, phone, taxId });
      toast({ title: "Dados pessoais atualizados" });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddressSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!addressForm) return;
    const postalCode = addressForm.postal_code.replace(/\D/g, "");
    const state = addressForm.state.trim().toUpperCase();
    if (postalCode.length !== 8 || state.length !== 2) {
      toast({ title: "Confira o CEP e a UF", description: "O CEP deve ter 8 números e a UF, 2 letras.", variant: "destructive" });
      return;
    }
    setSavingAddress(true);
    try {
      await saveCustomerAddress({ ...addressForm, postal_code: postalCode, state });
      await refresh();
      setAddressForm(null);
      toast({ title: "Endereço salvo" });
    } catch (error) {
      toast({ title: "Não foi possível salvar o endereço", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setSavingAddress(false);
    }
  };

  const editAddress = (address: CustomerAddress) => setAddressForm({
    id: address.id,
    label: address.label,
    recipient_name: address.recipient_name,
    recipient_phone: address.recipient_phone ?? "",
    postal_code: address.postal_code,
    street: address.street,
    number: address.number,
    complement: address.complement ?? "",
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    is_default: address.is_default,
  });

  const removeAddress = async (address: CustomerAddress) => {
    if (!window.confirm(`Remover o endereço “${address.label}”?`)) return;
    try {
      await deleteCustomerAddress(address);
      await refresh();
      toast({ title: "Endereço removido" });
    } catch (error) {
      toast({ title: "Não foi possível remover", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const makeDefault = async (address: CustomerAddress) => {
    try {
      await saveCustomerAddress({
        id: address.id,
        label: address.label,
        recipient_name: address.recipient_name,
        recipient_phone: address.recipient_phone,
        postal_code: address.postal_code,
        street: address.street,
        number: address.number,
        complement: address.complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        is_default: true,
      });
      await refresh();
      toast({ title: "Endereço principal atualizado" });
    } catch (error) {
      toast({ title: "Não foi possível alterar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <CustomerAccountNavigation active="account" />
        {loading ? (
          <div className="flex justify-center py-24"><LoaderCircle className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="font-artisan">Dados pessoais</CardTitle>
                <CardDescription>Usaremos estes dados durante o checkout e no acompanhamento dos pedidos.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="account-name">Nome completo</Label><Input id="account-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></div>
                  <div className="space-y-2"><Label htmlFor="account-email">E-mail</Label><Input id="account-email" type="email" value={email} disabled /><p className="text-xs text-muted-foreground">O e-mail é controlado pela autenticação da conta.</p></div>
                  <div className="space-y-2"><Label htmlFor="account-phone">Telefone</Label><Input id="account-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="account-tax-id">CPF</Label><Input id="account-tax-id" inputMode="numeric" value={taxId} onChange={(event) => setTaxId(event.target.value)} /></div>
                  <Button type="submit" disabled={savingProfile}>{savingProfile ? <LoaderCircle className="animate-spin" /> : <Check />} Salvar dados</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1.5">
                  <CardTitle className="font-artisan">Endereços</CardTitle>
                  <CardDescription>Cadastre os locais que poderão receber seus pedidos.</CardDescription>
                </div>
                {!addressForm && <Button size="sm" onClick={() => setAddressForm({ ...EMPTY_ADDRESS, recipient_name: fullName, recipient_phone: phone, is_default: addresses.length === 0 })}><Plus /> Adicionar</Button>}
              </CardHeader>
              <CardContent className="space-y-4">
                {addressForm && (
                  <form onSubmit={handleAddressSubmit} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                    <div className="flex items-center justify-between"><h3 className="font-medium">{addressForm.id ? "Editar endereço" : "Novo endereço"}</h3><Button type="button" size="icon" variant="ghost" onClick={() => setAddressForm(null)} aria-label="Cancelar"><X /></Button></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Identificação *</Label><Input value={addressForm.label} onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })} placeholder="Casa, Trabalho…" required /></div>
                      <div className="space-y-2"><Label>Destinatário *</Label><Input autoComplete="name" value={addressForm.recipient_name} onChange={(event) => setAddressForm({ ...addressForm, recipient_name: event.target.value })} required /></div>
                      <div className="space-y-2"><Label>Telefone</Label><Input inputMode="tel" autoComplete="tel" value={addressForm.recipient_phone ?? ""} onChange={(event) => setAddressForm({ ...addressForm, recipient_phone: event.target.value })} /></div>
                      <div className="space-y-2"><Label>CEP *</Label><Input inputMode="numeric" autoComplete="postal-code" maxLength={9} value={addressForm.postal_code} onChange={(event) => setAddressForm({ ...addressForm, postal_code: event.target.value })} required /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                      <div className="space-y-2"><Label>Logradouro *</Label><Input autoComplete="address-line1" value={addressForm.street} onChange={(event) => setAddressForm({ ...addressForm, street: event.target.value })} required /></div>
                      <div className="space-y-2"><Label>Número *</Label><Input value={addressForm.number} onChange={(event) => setAddressForm({ ...addressForm, number: event.target.value })} required /></div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2"><Label>Complemento</Label><Input autoComplete="address-line2" value={addressForm.complement ?? ""} onChange={(event) => setAddressForm({ ...addressForm, complement: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Bairro *</Label><Input value={addressForm.neighborhood} onChange={(event) => setAddressForm({ ...addressForm, neighborhood: event.target.value })} required /></div>
                      <div className="space-y-2"><Label>Cidade *</Label><Input autoComplete="address-level2" value={addressForm.city} onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })} required /></div>
                      <div className="space-y-2"><Label>UF *</Label><Input autoComplete="address-level1" maxLength={2} value={addressForm.state} onChange={(event) => setAddressForm({ ...addressForm, state: event.target.value.toUpperCase() })} required /></div>
                    </div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addressForm.is_default} onChange={(event) => setAddressForm({ ...addressForm, is_default: event.target.checked })} /> Usar como endereço principal</label>
                    <Button type="submit" disabled={savingAddress}>{savingAddress && <LoaderCircle className="animate-spin" />} Salvar endereço</Button>
                  </form>
                )}

                {addresses.length === 0 && !addressForm ? (
                  <div className="rounded-lg border border-dashed px-6 py-10 text-center text-muted-foreground"><MapPin className="mx-auto mb-3 h-8 w-8" /><p>Nenhum endereço cadastrado.</p></div>
                ) : (
                  addresses.map((address) => (
                    <div key={address.id} className="flex gap-3 rounded-lg border p-4">
                      <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2"><h3 className="font-medium">{address.label}</h3>{address.is_default && <Badge><Star className="mr-1 h-3 w-3" />Principal</Badge>}</div>
                        <p className="text-sm text-muted-foreground">{address.recipient_name}</p>
                        <p className="text-sm text-muted-foreground">{address.street}, {address.number}{address.complement ? ` — ${address.complement}` : ""}</p>
                        <p className="text-sm text-muted-foreground">{address.neighborhood}, {address.city}/{address.state} — CEP {address.postal_code}</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        {!address.is_default && <Button size="icon" variant="ghost" onClick={() => makeDefault(address)} title="Tornar principal"><Star /></Button>}
                        <Button size="icon" variant="ghost" onClick={() => editAddress(address)} title="Editar"><Pencil /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeAddress(address)} title="Remover"><Trash2 /></Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
