import { supabase } from "@/integrations/supabase/client";

export type ShippingOption = {
  serviceId: number;
  serviceName: string;
  carrier: { id: number | null; name: string; picture: string | null };
  priceCents: number;
  deliveryDays: number | null;
  packages: unknown[];
};

export type ShippingGroup = {
  producerId: string;
  producerName: string;
  items: Array<{ productId: string; name: string; quantity: number }>;
  options: ShippingOption[];
};

export type ShippingQuote = {
  quoteSessionId: string;
  expiresAt: string;
  destinationPostalCode: string;
  groups: ShippingGroup[];
};

export type ShippingSelection = { producerId: string; serviceId: number };

export type CheckoutSession = {
  order: {
    id: string;
    number: number;
    status: string;
    subtotalCents: number;
    shippingCents: number;
    totalCents: number;
    expiresAt: string;
  };
  publicKey: string;
  quoteSessionId: string;
  selections: Array<ShippingSelection & {
    serviceName: string;
    carrier: { id: number | null; name: string; picture: string | null };
    priceCents: number;
    deliveryDays: number | null;
  }>;
};

export type PaymentResult = {
  outcome: string;
  orderStatus: string;
  orderNumber: number | null;
  expiresAt: string | null;
  paymentAttemptId: string;
  payment: {
    providerOrderId: string;
    providerPaymentId: string | null;
    status: string;
    statusDetail: string;
    paymentMethod: string;
    qrCode: string | null;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
    challengeUrl: string | null;
  };
};

export class CheckoutApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error && data) return data;

  let payload: Record<string, unknown> = {};
  const context = object(error).context;
  if (context instanceof Response) {
    payload = object(await context.clone().json().catch(() => ({})));
  }
  const apiError = object(payload.error);
  throw new CheckoutApiError(
    typeof apiError.code === "string" ? apiError.code : "FUNCTION_REQUEST_FAILED",
    typeof apiError.message === "string"
      ? apiError.message
      : error?.message || "Não foi possível concluir a solicitação.",
    payload,
  );
}

export function requestShippingQuote(input: {
  postalCode: string;
  items: Array<{ productId: string; quantity: number }>;
}): Promise<ShippingQuote> {
  return invoke<ShippingQuote>("shipping-quotes", input);
}

export function createCheckoutSession(input: {
  quoteSessionId: string;
  addressId: string;
  idempotencyKey: string;
  selections: ShippingSelection[];
}): Promise<CheckoutSession> {
  return invoke<CheckoutSession>("checkout-session", input);
}

export function createPixPayment(input: {
  orderId: string;
  idempotencyKey: string;
}): Promise<PaymentResult> {
  return invoke<PaymentResult>("process-payment", { action: "create", method: "pix", ...input });
}

export function createCardPayment(input: {
  orderId: string;
  idempotencyKey: string;
  card: {
    token: string;
    paymentMethodId: string;
    paymentTypeId: string;
    installments: number;
  };
}): Promise<PaymentResult> {
  return invoke<PaymentResult>("process-payment", { action: "create", method: "card", ...input });
}

export function refreshPayment(input: {
  orderId: string;
  paymentAttemptId: string;
}): Promise<PaymentResult> {
  return invoke<PaymentResult>("process-payment", { action: "status", ...input });
}
