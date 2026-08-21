import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";

export type CustomerProfile = Tables<"customer_profiles">;
export type CustomerAddress = Tables<"customer_addresses">;
export type CustomerOrder = Tables<"orders">;
export type CustomerOrderItem = Tables<"order_items">;

export type CustomerAddressForm = Pick<
  CustomerAddress,
  | "label"
  | "recipient_name"
  | "recipient_phone"
  | "postal_code"
  | "street"
  | "number"
  | "complement"
  | "neighborhood"
  | "city"
  | "state"
  | "is_default"
> & { id?: string };

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error("Entre para acessar sua conta.");
  return data.user.id;
}

export async function loadCustomerProfile(): Promise<CustomerProfile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomerProfile(values: {
  fullName: string;
  phone: string;
  taxId: string;
}): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("customer_profiles")
    .update({
      full_name: values.fullName.trim() || null,
      phone: values.phone.replace(/\D/g, "") || null,
      tax_id: values.taxId.replace(/\D/g, "") || null,
    })
    .eq("id", userId);
  if (error) throw error;
}

export async function loadCustomerAddresses(): Promise<CustomerAddress[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("customer_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveCustomerAddress(values: CustomerAddressForm): Promise<void> {
  const userId = await requireUserId();
  const { count, error: countError } = await supabase
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", userId);
  if (countError) throw countError;

  const shouldBeDefault = values.is_default || count === 0;
  if (shouldBeDefault) {
    const { error } = await supabase
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("customer_id", userId);
    if (error) throw error;
  }

  const payload = {
    customer_id: userId,
    label: values.label.trim() || "Principal",
    recipient_name: values.recipient_name.trim(),
    recipient_phone: values.recipient_phone?.replace(/\D/g, "") || null,
    postal_code: values.postal_code.replace(/\D/g, ""),
    street: values.street.trim(),
    number: values.number.trim(),
    complement: values.complement?.trim() || null,
    neighborhood: values.neighborhood.trim(),
    city: values.city.trim(),
    state: values.state.trim().toUpperCase(),
    is_default: shouldBeDefault,
  };

  const query = values.id
    ? supabase.from("customer_addresses").update(payload).eq("id", values.id).eq("customer_id", userId)
    : supabase.from("customer_addresses").insert(payload);
  const { error } = await query;
  if (error) throw error;
}

export async function deleteCustomerAddress(address: CustomerAddress): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", address.id)
    .eq("customer_id", userId);
  if (error) throw error;

  if (address.is_default) {
    const { data: replacement, error: readError } = await supabase
      .from("customer_addresses")
      .select("id")
      .eq("customer_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (readError) throw readError;
    if (replacement) {
      const { error: updateError } = await supabase
        .from("customer_addresses")
        .update({ is_default: true })
        .eq("id", replacement.id)
        .eq("customer_id", userId);
      if (updateError) throw updateError;
    }
  }
}

export async function loadCustomerOrders(): Promise<CustomerOrder[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function loadCustomerOrder(orderId: string): Promise<{
  order: CustomerOrder;
  items: CustomerOrderItem[];
}> {
  const userId = await requireUserId();
  const [{ data: order, error: orderError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", orderId).eq("customer_id", userId).maybeSingle(),
    supabase.from("order_items").select("*").eq("order_id", orderId).order("created_at"),
  ]);
  if (orderError) throw orderError;
  if (!order) throw new Error("Pedido não encontrado.");
  if (itemsError) throw itemsError;
  return { order, items: items ?? [] };
}

export function jsonObject(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export const ORDER_STATUS_LABELS: Record<CustomerOrder["status"], string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  paid: "Pago",
  payment_failed: "Pagamento não aprovado",
  expired: "Expirado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

export function formatCents(value: number): string {
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}
