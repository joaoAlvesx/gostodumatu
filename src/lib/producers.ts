import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesUpdate } from "@/integrations/supabase/types";
import { deleteCatalogImages } from "@/lib/storage";

export type Producer = {
  id: string;
  name: string;
  slug: string;
  bio?: string;
  image?: string;
  location?: string;
  userId?: string;
};

export type CreateProducerInput = {
  name: string;
  email: string;
  password: string;
  location?: string;
  bio?: string;
};

function toProducer(producer: Tables<"producers">): Producer {
  return {
    id: producer.id,
    name: producer.name,
    slug: producer.slug,
    bio: producer.bio ?? "",
    image: producer.image ?? "",
    location: producer.location ?? "",
    userId: producer.user_id ?? undefined,
  };
}

export async function loadProducers(): Promise<Producer[]> {
  try {
    const { data, error } = await supabase.from("producers").select("*").order("name");
    if (error) throw error;
    return (data ?? []).map(toProducer);
  } catch (error) {
    console.error("Erro ao carregar produtores:", error);
    return [];
  }
}

export async function loadProducerBySlug(slug: string): Promise<Producer | null> {
  try {
    const { data, error } = await supabase.from("producers").select("*").eq("slug", slug).single();
    if (error) throw error;
    return toProducer(data);
  } catch (error) {
    console.error("Erro ao carregar produtor por slug:", error);
    return null;
  }
}

export async function loadProducerByUserId(userId: string): Promise<Producer | null> {
  try {
    const { data, error } = await supabase.from("producers").select("*").eq("user_id", userId).single();
    if (error) throw error;
    return toProducer(data);
  } catch (error) {
    console.error("Erro ao buscar loja do usuário logado:", error);
    return null;
  }
}

export async function createProducerWithAccount(
  input: CreateProducerInput,
): Promise<{ success: boolean; producer?: Producer; message?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke<{ producer: Tables<"producers"> }>(
      "create-producer",
      { body: input },
    );
    if (error) throw error;
    if (!data?.producer) throw new Error("A função não retornou o produtor criado.");

    window.dispatchEvent(new Event("producers:updated"));
    return { success: true, producer: toProducer(data.producer) };
  } catch (error) {
    console.error("Erro ao criar conta de produtor:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Falha ao cadastrar produtor",
    };
  }
}

export async function saveProducer(
  producer: Omit<Producer, "id"> & { id?: string },
): Promise<boolean> {
  try {
    const payload = {
      name: producer.name,
      slug: producer.slug || slugify(producer.name),
      bio: producer.bio ?? null,
      image: producer.image ?? null,
      location: producer.location ?? null,
    } satisfies TablesUpdate<"producers">;

    const query = producer.id
      ? supabase.from("producers").update(payload).eq("id", producer.id)
      : supabase.from("producers").insert(payload);
    const { error } = await query;
    if (error) throw error;

    window.dispatchEvent(new Event("producers:updated"));
    return true;
  } catch (error) {
    console.error("Erro ao salvar produtor:", error);
    return false;
  }
}

export async function deleteProducer(id: string): Promise<boolean> {
  try {
    const { data: producer, error: readError } = await supabase
      .from("producers")
      .select("image")
      .eq("id", id)
      .single();
    if (readError) throw readError;

    const { error } = await supabase.from("producers").delete().eq("id", id);
    if (error) throw error;

    if (producer.image) {
      try {
        await deleteCatalogImages([producer.image]);
      } catch (storageError) {
        console.error("Produtor removido, mas houve falha ao limpar sua imagem:", storageError);
      }
    }

    window.dispatchEvent(new Event("producers:updated"));
    return true;
  } catch (error) {
    console.error("Erro ao deletar produtor:", error);
    return false;
  }
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
