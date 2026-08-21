import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type FulfillmentProfile = {
  producerId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  taxId: string;
  originPostalCode: string;
  originStreet: string;
  originNumber: string;
  originComplement: string;
  originNeighborhood: string;
  originCity: string;
  originState: string;
  specialInstructions: string;
  isActive: boolean;
};

export function emptyFulfillmentProfile(producerId: string): FulfillmentProfile {
  return {
    producerId,
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    taxId: "",
    originPostalCode: "",
    originStreet: "",
    originNumber: "",
    originComplement: "",
    originNeighborhood: "",
    originCity: "",
    originState: "MS",
    specialInstructions: "",
    isActive: true,
  };
}

function toFulfillmentProfile(
  profile: Tables<"producer_fulfillment_profiles">,
): FulfillmentProfile {
  return {
    producerId: profile.producer_id,
    contactName: profile.contact_name,
    contactEmail: profile.contact_email ?? "",
    contactPhone: profile.contact_phone,
    taxId: profile.tax_id ?? "",
    originPostalCode: profile.origin_postal_code,
    originStreet: profile.origin_street,
    originNumber: profile.origin_number,
    originComplement: profile.origin_complement ?? "",
    originNeighborhood: profile.origin_neighborhood,
    originCity: profile.origin_city,
    originState: profile.origin_state,
    specialInstructions: profile.special_instructions ?? "",
    isActive: profile.is_active,
  };
}

export async function loadFulfillmentProfile(
  producerId: string,
): Promise<FulfillmentProfile | null> {
  const { data, error } = await supabase
    .from("producer_fulfillment_profiles")
    .select("*")
    .eq("producer_id", producerId)
    .maybeSingle();
  if (error) throw error;
  return data ? toFulfillmentProfile(data) : null;
}

export async function saveFulfillmentProfile(
  profile: FulfillmentProfile,
): Promise<void> {
  const payload = {
    producer_id: profile.producerId,
    contact_name: profile.contactName.trim(),
    contact_email: profile.contactEmail.trim() || null,
    contact_phone: profile.contactPhone.replace(/\D/g, ""),
    tax_id: profile.taxId.replace(/\D/g, "") || null,
    origin_postal_code: profile.originPostalCode.replace(/\D/g, ""),
    origin_street: profile.originStreet.trim(),
    origin_number: profile.originNumber.trim(),
    origin_complement: profile.originComplement.trim() || null,
    origin_neighborhood: profile.originNeighborhood.trim(),
    origin_city: profile.originCity.trim(),
    origin_state: profile.originState.trim().toUpperCase(),
    special_instructions: profile.specialInstructions.trim() || null,
    is_active: profile.isActive,
  } satisfies TablesInsert<"producer_fulfillment_profiles">;

  const { error } = await supabase
    .from("producer_fulfillment_profiles")
    .upsert(payload, { onConflict: "producer_id" });
  if (error) throw error;
}
