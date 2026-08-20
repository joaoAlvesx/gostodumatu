import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { deleteCatalogImages } from "@/lib/storage";

export { supabase };

export type Product = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string[];
  category: string;
  description: string;
  isNew?: boolean;
  producerId?: string;
};

function normalizeImages(value: string[]): string[] {
  return value.filter((item) => typeof item === "string");
}

export async function loadProducts(producerId?: string): Promise<Product[]> {
  try {
    let query = supabase.from("products").select("*").order("created_at", { ascending: false });
    if (producerId) query = query.eq("producer_id", producerId);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      originalPrice: product.original_price == null ? undefined : Number(product.original_price),
      image: normalizeImages(product.image),
      category: product.category,
      description: product.description ?? "",
      isNew: product.is_new,
      producerId: product.producer_id ?? undefined,
    }));
  } catch (error) {
    console.error("Erro ao carregar produtos do Supabase:", error);
    return [];
  }
}

export async function saveProducts(product: Product): Promise<boolean> {
  try {
    const databaseData = {
      id: product.id,
      name: product.name,
      price: product.price,
      original_price: product.originalPrice ?? null,
      image: product.image,
      category: product.category,
      description: product.description,
      is_new: product.isNew ?? false,
      producer_id: product.producerId ?? null,
    } satisfies TablesInsert<"products">;

    const { error } = await supabase.from("products").upsert(databaseData, { onConflict: "id" });
    if (error) throw error;

    window.dispatchEvent(new Event("products:updated"));
    return true;
  } catch (error) {
    console.error("Erro ao salvar produto no Supabase:", error);
    return false;
  }
}

export async function deleteProductFromDatabase(id: string): Promise<boolean> {
  try {
    const { data: product, error: readError } = await supabase
      .from("products")
      .select("image")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;

    try {
      await deleteCatalogImages(normalizeImages(product.image));
    } catch (storageError) {
      console.error("Produto removido, mas houve falha ao limpar suas imagens:", storageError);
    }

    window.dispatchEvent(new Event("products:updated"));
    return true;
  } catch (error) {
    console.error("Erro ao deletar produto do Supabase:", error);
    return false;
  }
}

export function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
