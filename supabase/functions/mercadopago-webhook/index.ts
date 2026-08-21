import { errorResponse, jsonResponse } from "../_shared/http.ts";
import {
  mercadoPagoConfig,
  mercadoPagoPublicError,
  mercadoPagoRequest,
  reconcileMercadoPagoOrder,
  verifyMercadoPagoWebhookSignature,
} from "../_shared/mercado-pago.ts";
import { createAdminClient } from "../_shared/supabase.ts";

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mockProviderStatus(stored: Record<string, unknown>, requested: string): Record<string, unknown> {
  const response = structuredClone(stored);
  const transactions = object(response.transactions);
  const rows = Array.isArray(transactions.payments) ? transactions.payments as Record<string, unknown>[] : [];
  const payment = object(rows[0]);
  const status = requested === "approved" ? "processed" : requested === "rejected" ? "failed" : "action_required";
  const detail = requested === "approved" ? "accredited" : requested === "rejected" ? "cc_rejected_other_reason" : "waiting_transfer";
  response.status = status;
  response.status_detail = detail;
  payment.status = status;
  payment.status_detail = detail;
  transactions.payments = [payment];
  response.transactions = transactions;
  return response;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "Método não permitido.", 405);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Corpo JSON inválido.", 400);
  }

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id") || text(object(payload.data).id);
  const signatureValid = await verifyMercadoPagoWebhookSignature(request, dataId);
  if (!signatureValid) return errorResponse("INVALID_WEBHOOK_SIGNATURE", "Assinatura inválida.", 401);

  const requestId = request.headers.get("x-request-id") ?? "";
  const eventId = text(payload.id) || requestId;
  const eventType = text(payload.type) || "unknown";
  if (!eventId) return errorResponse("INVALID_WEBHOOK_EVENT", "Evento sem identificador.", 400);

  const admin = createAdminClient();
  const { data: insertedEvent, error: insertError } = await admin.from("webhook_events").insert({
    provider: "mercado_pago",
    external_event_id: eventId,
    event_type: eventType,
    status: "processing",
    signature_valid: true,
    payload,
    processing_attempts: 1,
  }).select("id").maybeSingle();

  let event = insertedEvent;
  if (insertError?.code === "23505") {
    const { data: existing, error } = await admin
      .from("webhook_events")
      .select("id, status, processing_attempts")
      .eq("provider", "mercado_pago")
      .eq("external_event_id", eventId)
      .maybeSingle();
    if (error || !existing) return errorResponse("WEBHOOK_STORAGE_FAILED", "Não foi possível recuperar o evento.", 500);
    if (["processed", "ignored"].includes(existing.status)) return jsonResponse({ received: true, duplicate: true }, 200);
    const { data: claimed, error: claimError } = await admin.from("webhook_events").update({
      status: "processing",
      processing_attempts: existing.processing_attempts + 1,
      last_error: null,
    }).eq("id", existing.id).eq("status", "failed").select("id").maybeSingle();
    if (claimError || !claimed) return jsonResponse({ received: true, processing: true }, 200);
    event = claimed;
  } else if (insertError || !event) {
    return errorResponse("WEBHOOK_STORAGE_FAILED", "Não foi possível registrar o evento.", 500);
  }

  if (!dataId || !["order", "orders"].includes(eventType)) {
    await admin.from("webhook_events").update({ status: "ignored", processed_at: new Date().toISOString() }).eq("id", event.id);
    return jsonResponse({ received: true, ignored: true }, 200);
  }

  try {
    let providerOrder: Record<string, unknown>;
    if (mercadoPagoConfig().mock) {
      const { data: attempt } = await admin
        .from("payment_attempts")
        .select("provider_response")
        .eq("provider_order_id", dataId)
        .maybeSingle();
      if (!attempt) throw new Error("Mock payment attempt not found");
      const requested = ["approved", "rejected", "pending"].includes(url.searchParams.get("mock_status") ?? "")
        ? url.searchParams.get("mock_status")!
        : "pending";
      providerOrder = mockProviderStatus(object(attempt.provider_response), requested);
    } else {
      providerOrder = await mercadoPagoRequest<Record<string, unknown>>(
        `/v1/orders/${encodeURIComponent(dataId)}`,
        { method: "GET" },
      );
    }

    if (text(providerOrder.id) !== dataId) throw new Error("Provider order mismatch");
    const orderId = text(providerOrder.external_reference);
    if (!validUuid(orderId)) throw new Error("Invalid external reference");

    let { data: attempt, error: attemptError } = await admin
      .from("payment_attempts")
      .select("id")
      .eq("provider_order_id", dataId)
      .maybeSingle();
    if (!attempt && !attemptError) {
      const fallback = await admin
        .from("payment_attempts")
        .select("id")
        .eq("order_id", orderId)
        .in("status", ["created", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      attempt = fallback.data;
      attemptError = fallback.error;
    }
    if (attemptError || !attempt) throw new Error("Payment attempt not found");

    const result = await reconcileMercadoPagoOrder(admin, orderId, attempt.id, providerOrder);
    await admin.from("webhook_events").update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", event.id);
    return jsonResponse({ received: true, outcome: result.outcome }, 200);
  } catch (error) {
    const publicError = mercadoPagoPublicError(error);
    await admin.from("webhook_events").update({
      status: "failed",
      last_error: publicError.code,
    }).eq("id", event.id);
    return errorResponse("WEBHOOK_PROCESSING_FAILED", "O evento será processado novamente.", 500);
  }
});
