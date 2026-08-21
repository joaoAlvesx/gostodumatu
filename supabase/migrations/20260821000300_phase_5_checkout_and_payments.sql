-- Fase 5: checkout, conciliacao de pagamentos e expiracao automatica.

alter table public.orders
  add column if not exists paid_at timestamptz;

alter table public.payment_attempts
  add column if not exists expires_at timestamptz;

create unique index if not exists payment_attempts_provider_payment_id_idx
  on public.payment_attempts (provider, provider_payment_id)
  where provider_payment_id is not null;

create or replace function public.finalize_paid_order(
  target_order_id uuid,
  target_payment_attempt_id uuid,
  external_order_id text,
  external_payment_id text,
  external_status text,
  external_status_detail text,
  sanitized_response jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  current_attempt public.payment_attempts%rowtype;
  current_reservation record;
  item_count integer;
  active_count integer;
  reservation_failed boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  if external_status <> 'processed'
    or nullif(external_order_id, '') is null
    or jsonb_typeof(sanitized_response) <> 'object'
  then
    raise exception 'invalid payment reconciliation';
  end if;

  select * into current_order
  from public.orders
  where id = target_order_id
  for update;

  select * into current_attempt
  from public.payment_attempts
  where id = target_payment_attempt_id
    and order_id = target_order_id
  for update;

  if current_order.id is null or current_attempt.id is null then
    raise exception 'order or payment attempt not found';
  end if;

  if current_attempt.amount_cents <> current_order.total_amount_cents then
    raise exception 'payment amount does not match order total';
  end if;

  if current_order.status = 'paid' then
    update public.payment_attempts
    set
      provider_order_id = external_order_id,
      provider_payment_id = nullif(external_payment_id, ''),
      status = 'approved',
      status_detail = external_status_detail,
      provider_response = sanitized_response
    where id = target_payment_attempt_id;
    return 'paid';
  end if;

  if current_order.status = 'refunded' then
    return 'refunded';
  end if;

  update public.inventory_reservations
  set
    status = 'expired',
    released_at = coalesce(released_at, now()),
    release_reason = coalesce(release_reason, 'reservation_expired')
  where order_id = target_order_id
    and status = 'active'
    and expires_at <= now();

  select count(*) into item_count
  from public.order_items
  where order_id = target_order_id;

  select count(*) into active_count
  from public.inventory_reservations
  where order_id = target_order_id
    and status = 'active'
    and expires_at > now();

  if active_count <> item_count then
    begin
      perform *
      from public.reserve_order_inventory(target_order_id, now() + interval '5 minutes');
    exception
      when others then reservation_failed := true;
    end;
  end if;

  if not reservation_failed then
    select count(*) into active_count
    from public.inventory_reservations
    where order_id = target_order_id
      and status = 'active'
      and expires_at > now();
    reservation_failed := active_count <> item_count;
  end if;

  if not reservation_failed then
    for current_reservation in
      select reservation.product_id, reservation.quantity
      from public.inventory_reservations as reservation
      where reservation.order_id = target_order_id
        and reservation.status = 'active'
        and reservation.expires_at > now()
      order by reservation.product_id
    loop
      perform 1
      from public.products
      where id = current_reservation.product_id
        and stock_quantity >= current_reservation.quantity
      for update;
      if not found then
        reservation_failed := true;
        exit;
      end if;
    end loop;
  end if;

  if reservation_failed then
    update public.payment_attempts
    set
      provider_order_id = external_order_id,
      provider_payment_id = nullif(external_payment_id, ''),
      status = 'approved',
      status_detail = external_status_detail,
      provider_response = sanitized_response
    where id = target_payment_attempt_id;

    update public.orders
    set status = 'payment_failed'
    where id = target_order_id;

    insert into public.refunds (
      order_id,
      payment_attempt_id,
      idempotency_key,
      amount_cents,
      status,
      reason
    )
    values (
      target_order_id,
      target_payment_attempt_id,
      'auto-refund-' || target_payment_attempt_id::text,
      current_order.total_amount_cents,
      'pending',
      'Pagamento aprovado apos expiracao sem estoque disponível'
    )
    on conflict (idempotency_key) do nothing;

    insert into public.order_events (order_id, event_type, payload)
    values (
      target_order_id,
      'payment_approved_without_inventory',
      jsonb_build_object(
        'payment_attempt_id', target_payment_attempt_id,
        'provider_order_id', external_order_id,
        'requires_admin_attention', true
      )
    );
    return 'refund_required';
  end if;

  for current_reservation in
    select reservation.id, reservation.product_id, reservation.quantity
    from public.inventory_reservations as reservation
    where reservation.order_id = target_order_id
      and reservation.status = 'active'
      and reservation.expires_at > now()
    order by reservation.product_id
  loop
    update public.products
    set stock_quantity = stock_quantity - current_reservation.quantity
    where id = current_reservation.product_id;

    update public.inventory_reservations
    set
      status = 'converted',
      released_at = now(),
      release_reason = 'payment_approved'
    where id = current_reservation.id;
  end loop;

  update public.payment_attempts
  set
    provider_order_id = external_order_id,
    provider_payment_id = nullif(external_payment_id, ''),
    status = 'approved',
    status_detail = external_status_detail,
    provider_response = sanitized_response
  where id = target_payment_attempt_id;

  update public.orders
  set
    status = 'paid',
    paid_at = coalesce(paid_at, now()),
    inventory_expires_at = null
  where id = target_order_id;

  insert into public.fulfillment_jobs (
    order_id,
    shipment_id,
    job_type,
    idempotency_key,
    payload
  )
  select
    shipment.order_id,
    shipment.id,
    'create_shipping_label',
    'label-' || shipment.id::text,
    jsonb_build_object('payment_attempt_id', target_payment_attempt_id)
  from public.shipments as shipment
  where shipment.order_id = target_order_id
  on conflict (idempotency_key) do nothing;

  insert into public.order_events (order_id, event_type, payload)
  values (
    target_order_id,
    'payment_approved',
    jsonb_build_object(
      'payment_attempt_id', target_payment_attempt_id,
      'provider_order_id', external_order_id,
      'provider_payment_id', nullif(external_payment_id, '')
    )
  );

  return 'paid';
end;
$$;

create or replace function public.record_payment_state(
  target_order_id uuid,
  target_payment_attempt_id uuid,
  external_order_id text,
  external_payment_id text,
  external_status text,
  external_status_detail text,
  sanitized_response jsonb default '{}'::jsonb
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  current_attempt public.payment_attempts%rowtype;
  next_attempt_status public.payment_attempt_status;
  next_order_status public.order_status;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  select * into current_order
  from public.orders
  where id = target_order_id
  for update;

  select * into current_attempt
  from public.payment_attempts
  where id = target_payment_attempt_id
    and order_id = target_order_id
  for update;

  if current_order.id is null or current_attempt.id is null then
    raise exception 'order or payment attempt not found';
  end if;

  if current_order.status in ('paid', 'refunded') and external_status <> 'refunded' then
    return current_order.status;
  end if;

  if external_status in ('created', 'processing', 'action_required') then
    next_attempt_status := 'pending';
    if current_order.status = 'expired'
      or current_order.inventory_expires_at is null
      or current_order.inventory_expires_at <= now()
    then
      next_order_status := 'expired';
      update public.inventory_reservations
      set
        status = 'expired',
        released_at = coalesce(released_at, now()),
        release_reason = coalesce(release_reason, 'payment_expired')
      where order_id = target_order_id
        and status = 'active';
    else
      next_order_status := 'awaiting_payment';
    end if;
  elsif external_status = 'failed' then
    next_attempt_status := 'rejected';
    next_order_status := 'payment_failed';
  elsif external_status in ('canceled', 'cancelled', 'expired') then
    next_attempt_status := 'cancelled';
    if current_order.status = 'expired'
      or current_order.inventory_expires_at is null
      or current_order.inventory_expires_at <= now()
    then
      next_order_status := 'expired';
      update public.inventory_reservations
      set
        status = 'expired',
        released_at = coalesce(released_at, now()),
        release_reason = coalesce(release_reason, 'payment_expired')
      where order_id = target_order_id
        and status = 'active';
    else
      next_order_status := 'payment_failed';
    end if;
  elsif external_status = 'refunded' then
    next_attempt_status := 'refunded';
    next_order_status := 'refunded';
  else
    next_attempt_status := 'error';
    next_order_status := 'payment_failed';
  end if;

  update public.payment_attempts
  set
    provider_order_id = coalesce(nullif(external_order_id, ''), provider_order_id),
    provider_payment_id = coalesce(nullif(external_payment_id, ''), provider_payment_id),
    status = next_attempt_status,
    status_detail = external_status_detail,
    provider_response = sanitized_response
  where id = target_payment_attempt_id;

  update public.orders
  set status = next_order_status
  where id = target_order_id;

  insert into public.order_events (order_id, event_type, payload)
  values (
    target_order_id,
    'payment_' || next_attempt_status::text,
    jsonb_build_object(
      'payment_attempt_id', target_payment_attempt_id,
      'provider_status', external_status,
      'status_detail', external_status_detail
    )
  );

  return next_order_status;
end;
$$;

create or replace function public.complete_automatic_refund(
  target_order_id uuid,
  target_payment_attempt_id uuid,
  external_refund_id text,
  refund_succeeded boolean,
  sanitized_response jsonb default '{}'::jsonb
)
returns public.order_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_order_status public.order_status;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  perform 1 from public.orders where id = target_order_id for update;
  if not found then raise exception 'order not found'; end if;

  if refund_succeeded then
    update public.refunds
    set
      provider_refund_id = nullif(external_refund_id, ''),
      status = 'approved',
      provider_response = sanitized_response
    where order_id = target_order_id
      and payment_attempt_id = target_payment_attempt_id
      and idempotency_key = 'auto-refund-' || target_payment_attempt_id::text;

    update public.payment_attempts
    set status = 'refunded'
    where id = target_payment_attempt_id;

    update public.orders
    set status = 'refunded'
    where id = target_order_id;
    next_order_status := 'refunded';
  else
    update public.refunds
    set
      status = 'error',
      provider_response = sanitized_response
    where order_id = target_order_id
      and payment_attempt_id = target_payment_attempt_id
      and idempotency_key = 'auto-refund-' || target_payment_attempt_id::text;
    next_order_status := 'payment_failed';
  end if;

  insert into public.order_events (order_id, event_type, payload)
  values (
    target_order_id,
    case when refund_succeeded then 'automatic_refund_approved' else 'automatic_refund_failed' end,
    jsonb_build_object(
      'payment_attempt_id', target_payment_attempt_id,
      'provider_refund_id', nullif(external_refund_id, ''),
      'requires_admin_attention', not refund_succeeded
    )
  );

  return next_order_status;
end;
$$;

revoke all on function public.finalize_paid_order(uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.record_payment_state(uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.complete_automatic_refund(uuid, uuid, text, boolean, jsonb) from public;
revoke all on function public.reserve_order_inventory(uuid, timestamptz) from authenticated;
revoke all on function public.create_order_with_inventory(uuid, jsonb, jsonb, jsonb, text, bigint, bigint, timestamptz) from authenticated;
revoke all on function public.expire_inventory_reservations() from authenticated;

grant execute on function public.finalize_paid_order(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.record_payment_state(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.complete_automatic_refund(uuid, uuid, text, boolean, jsonb) to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'expire-checkout-reservations';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  perform cron.schedule(
    'expire-checkout-reservations',
    '* * * * *',
    $job$select set_config('request.jwt.claim.role', 'service_role', true); select public.expire_inventory_reservations();$job$
  );
exception
  when undefined_table or insufficient_privilege then
    raise notice 'pg_cron unavailable; checkout expiration must be scheduled externally';
end
$$;
