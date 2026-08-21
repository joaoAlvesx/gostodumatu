-- Fase 2: dados comerciais, pedidos, expedicao e reservas de estoque.
-- Valores monetarios dos pedidos sao armazenados em centavos.

do $$
begin
  create type public.product_checkout_status as enum ('draft', 'available', 'paused');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.order_status as enum (
    'draft',
    'awaiting_payment',
    'paid',
    'payment_failed',
    'expired',
    'cancelled',
    'refunded'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.shipment_status as enum (
    'pending',
    'quoted',
    'label_pending',
    'label_created',
    'shipped',
    'delivered',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.inventory_reservation_status as enum (
    'active',
    'converted',
    'released',
    'expired'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.payment_attempt_status as enum (
    'created',
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'refunded',
    'error'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.refund_status as enum ('pending', 'approved', 'rejected', 'error');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.webhook_event_status as enum (
    'received',
    'processing',
    'processed',
    'failed',
    'ignored'
  );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.fulfillment_job_status as enum (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.products
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists weight_grams integer,
  add column if not exists height_cm numeric(10, 2),
  add column if not exists width_cm numeric(10, 2),
  add column if not exists length_cm numeric(10, 2),
  add column if not exists checkout_status public.product_checkout_status not null default 'draft';

do $$
begin
  alter table public.products
    add constraint products_stock_quantity_check check (stock_quantity >= 0);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.products
    add constraint products_package_dimensions_check check (
      (weight_grams is null or weight_grams > 0)
      and (height_cm is null or height_cm > 0)
      and (width_cm is null or width_cm > 0)
      and (length_cm is null or length_cm > 0)
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.products
    add constraint products_available_for_checkout_check check (
      checkout_status <> 'available'
      or (
        producer_id is not null
        and weight_grams is not null
        and height_cm is not null
        and width_cm is not null
        and length_cm is not null
      )
    );
exception
  when duplicate_object then null;
end
$$;

create index if not exists products_checkout_status_idx
  on public.products (checkout_status)
  where checkout_status = 'available';

create table if not exists public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  label text not null default 'Principal',
  recipient_name text not null,
  recipient_phone text,
  postal_code text not null check (postal_code ~ '^[0-9]{8}$'),
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default;
create index if not exists customer_addresses_customer_id_idx
  on public.customer_addresses (customer_id, created_at desc);

create table if not exists public.producer_fulfillment_profiles (
  producer_id uuid primary key references public.producers(id) on delete cascade,
  contact_name text not null,
  contact_email text,
  contact_phone text not null,
  tax_id text,
  origin_postal_code text not null check (origin_postal_code ~ '^[0-9]{8}$'),
  origin_street text not null,
  origin_number text not null,
  origin_complement text,
  origin_neighborhood text not null,
  origin_city text not null,
  origin_state text not null check (origin_state ~ '^[A-Z]{2}$'),
  special_instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated by default as identity unique,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  status public.order_status not null default 'draft',
  currency text not null default 'BRL' check (currency = 'BRL'),
  subtotal_amount_cents bigint not null default 0 check (subtotal_amount_cents >= 0),
  shipping_amount_cents bigint not null default 0 check (shipping_amount_cents >= 0),
  discount_amount_cents bigint not null default 0 check (discount_amount_cents >= 0),
  total_amount_cents bigint not null default 0 check (total_amount_cents >= 0),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  shipping_address_snapshot jsonb not null check (jsonb_typeof(shipping_address_snapshot) = 'object'),
  inventory_expires_at timestamptz,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_amounts_match_check check (
    total_amount_cents = subtotal_amount_cents + shipping_amount_cents - discount_amount_cents
    and discount_amount_cents <= subtotal_amount_cents + shipping_amount_cents
  )
);

create index if not exists orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc);
create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  producer_id uuid not null references public.producers(id) on delete restrict,
  product_name text not null,
  product_snapshot jsonb not null check (jsonb_typeof(product_snapshot) = 'object'),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0),
  line_total_cents bigint generated always as (unit_price_cents * quantity::bigint) stored,
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_producer_id_idx on public.order_items (producer_id, order_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  producer_id uuid not null references public.producers(id) on delete restrict,
  status public.shipment_status not null default 'pending',
  origin_address_snapshot jsonb not null check (jsonb_typeof(origin_address_snapshot) = 'object'),
  destination_address_snapshot jsonb not null check (jsonb_typeof(destination_address_snapshot) = 'object'),
  package_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(package_snapshot) = 'object'),
  shipping_amount_cents bigint not null default 0 check (shipping_amount_cents >= 0),
  carrier text,
  service_name text,
  external_shipment_id text,
  tracking_code text,
  label_url text,
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, producer_id)
);

create index if not exists shipments_producer_id_status_idx
  on public.shipments (producer_id, status, created_at desc);

create table if not exists public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status public.inventory_reservation_status not null default 'active',
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_reservations_product_active_idx
  on public.inventory_reservations (product_id, expires_at)
  where status = 'active';
create index if not exists inventory_reservations_order_id_idx
  on public.inventory_reservations (order_id);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'mercado_pago',
  provider_order_id text,
  provider_payment_id text,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  payment_method text,
  status public.payment_attempt_status not null default 'created',
  amount_cents bigint not null check (amount_cents > 0),
  status_detail text,
  provider_response jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_response) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_attempts_provider_order_id_idx
  on public.payment_attempts (provider, provider_order_id)
  where provider_order_id is not null;
create index if not exists payment_attempts_order_id_created_at_idx
  on public.payment_attempts (order_id, created_at desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_attempt_id uuid not null references public.payment_attempts(id) on delete restrict,
  provider_refund_id text,
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  amount_cents bigint not null check (amount_cents > 0),
  status public.refund_status not null default 'pending',
  reason text,
  provider_response jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_response) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists refunds_provider_refund_id_idx
  on public.refunds (provider_refund_id)
  where provider_refund_id is not null;

create table if not exists public.order_events (
  id bigint generated by default as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_type text not null default 'system',
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_id_created_at_idx
  on public.order_events (order_id, created_at);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null,
  event_type text not null,
  status public.webhook_event_status not null default 'received',
  signature_valid boolean not null default false,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  processing_attempts integer not null default 0 check (processing_attempts >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, external_event_id)
);

create index if not exists webhook_events_status_received_at_idx
  on public.webhook_events (status, received_at);

create table if not exists public.fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  shipment_id uuid references public.shipments(id) on delete cascade,
  job_type text not null,
  status public.fulfillment_job_status not null default 'pending',
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  run_after timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (order_id is not null or shipment_id is not null)
);

create index if not exists fulfillment_jobs_pending_idx
  on public.fulfillment_jobs (run_after, created_at)
  where status = 'pending';

create or replace function public.handle_new_customer_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'),
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_customer_profile on auth.users;
create trigger on_auth_user_created_create_customer_profile
  after insert or update of email on auth.users
  for each row execute function public.handle_new_customer_profile();

insert into public.customer_profiles (id, full_name, email)
select
  users.id,
  coalesce(
    profiles.display_name,
    users.raw_user_meta_data ->> 'name',
    users.raw_user_meta_data ->> 'full_name'
  ),
  users.email
from auth.users as users
left join public.profiles as profiles on profiles.id = users.id
on conflict (id) do update set email = excluded.email;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customer_profiles',
    'customer_addresses',
    'producer_fulfillment_profiles',
    'orders',
    'shipments',
    'inventory_reservations',
    'payment_attempts',
    'refunds',
    'fulfillment_jobs'
  ]
  loop
    execute format('drop trigger if exists set_%I_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end
$$;

create or replace function public.reserve_order_inventory(
  target_order_id uuid,
  reservation_expires_at timestamptz default (now() + interval '30 minutes')
)
returns table (product_id uuid, reserved_quantity integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  current_item public.order_items%rowtype;
  current_product public.products%rowtype;
  active_quantity bigint;
  item_count integer;
  active_count integer;
begin
  if auth.role() <> 'service_role'
    and not public.has_role('super_admin'::public.app_role)
  then
    raise exception 'inventory reservations require an administrative backend';
  end if;

  if reservation_expires_at <= now()
    or reservation_expires_at > now() + interval '24 hours'
  then
    raise exception 'reservation expiration must be within the next 24 hours';
  end if;

  select *
  into current_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'order % not found', target_order_id;
  end if;

  if current_order.status not in ('draft', 'awaiting_payment', 'payment_failed', 'expired') then
    raise exception 'order % cannot reserve inventory while %', target_order_id, current_order.status;
  end if;

  select count(*) into item_count
  from public.order_items as item
  where item.order_id = target_order_id;

  if item_count = 0 then
    raise exception 'order % has no items', target_order_id;
  end if;

  select count(*) into active_count
  from public.inventory_reservations as reservation
  where reservation.order_id = target_order_id
    and reservation.status = 'active'
    and reservation.expires_at > now();

  if active_count > 0 then
    if active_count <> item_count then
      raise exception 'order % has an incomplete active reservation', target_order_id;
    end if;

    return query
      select reservation.product_id, reservation.quantity, reservation.expires_at
      from public.inventory_reservations as reservation
      where reservation.order_id = target_order_id
        and reservation.status = 'active'
        and reservation.expires_at > now()
      order by reservation.product_id;
    return;
  end if;

  update public.inventory_reservations as reservation
  set
    status = 'expired',
    released_at = coalesce(reservation.released_at, now()),
    release_reason = coalesce(reservation.release_reason, 'reservation_expired')
  where reservation.order_id = target_order_id
    and reservation.status = 'active'
    and reservation.expires_at <= now();

  -- A ordem por product_id evita deadlocks quando dois carrinhos concorrentes
  -- tentam reservar os mesmos produtos em sequencias diferentes.
  for current_item in
    select item.*
    from public.order_items as item
    where item.order_id = target_order_id
    order by item.product_id
  loop
    select *
    into current_product
    from public.products
    where id = current_item.product_id
    for update;

    if not found then
      raise exception 'product % not found', current_item.product_id;
    end if;

    if current_product.checkout_status <> 'available' then
      raise exception 'product % is not available for checkout', current_product.id;
    end if;

    update public.inventory_reservations as reservation
    set
      status = 'expired',
      released_at = coalesce(reservation.released_at, now()),
      release_reason = coalesce(reservation.release_reason, 'reservation_expired')
    where reservation.product_id = current_product.id
      and reservation.status = 'active'
      and reservation.expires_at <= now();

    select coalesce(sum(reservation.quantity), 0)
    into active_quantity
    from public.inventory_reservations as reservation
    where reservation.product_id = current_product.id
      and reservation.status = 'active'
      and reservation.expires_at > now();

    if current_product.stock_quantity - active_quantity < current_item.quantity then
      raise exception 'insufficient stock for product %', current_product.id;
    end if;

    insert into public.inventory_reservations (
      order_id,
      order_item_id,
      product_id,
      quantity,
      status,
      expires_at,
      released_at,
      release_reason
    )
    values (
      target_order_id,
      current_item.id,
      current_item.product_id,
      current_item.quantity,
      'active',
      reservation_expires_at,
      null,
      null
    )
    on conflict (order_item_id) do update set
      quantity = excluded.quantity,
      status = 'active',
      expires_at = excluded.expires_at,
      released_at = null,
      release_reason = null;
  end loop;

  update public.orders
  set
    status = 'awaiting_payment',
    inventory_expires_at = reservation_expires_at
  where id = target_order_id;

  insert into public.order_events (order_id, event_type, payload)
  values (
    target_order_id,
    'inventory_reserved',
    jsonb_build_object('expires_at', reservation_expires_at)
  );

  return query
    select reservation.product_id, reservation.quantity, reservation.expires_at
    from public.inventory_reservations as reservation
    where reservation.order_id = target_order_id
      and reservation.status = 'active'
    order by reservation.product_id;
end;
$$;

create or replace function public.create_order_with_inventory(
  customer_profile_id uuid,
  customer_data jsonb,
  shipping_address_data jsonb,
  cart_items jsonb,
  request_idempotency_key text,
  shipping_cost_cents bigint default 0,
  discount_cents bigint default 0,
  reservation_expires_at timestamptz default (now() + interval '30 minutes')
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_order_id uuid;
  existing_order_id uuid;
  cart_item record;
  current_product public.products%rowtype;
  subtotal_cents bigint := 0;
  unit_price_cents bigint;
begin
  if auth.role() <> 'service_role'
    and not public.has_role('super_admin'::public.app_role)
  then
    raise exception 'orders must be created by the checkout backend';
  end if;

  if request_idempotency_key is null
    or length(request_idempotency_key) not between 8 and 200
  then
    raise exception 'invalid idempotency key';
  end if;

  -- Serializa repeticoes simultaneas da mesma requisicao antes da consulta.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(request_idempotency_key, 0)
  );

  select id into existing_order_id
  from public.orders
  where idempotency_key = request_idempotency_key;

  if found then
    return existing_order_id;
  end if;

  if not exists (
    select 1 from public.customer_profiles where id = customer_profile_id
  ) then
    raise exception 'customer profile % not found', customer_profile_id;
  end if;

  if jsonb_typeof(customer_data) <> 'object'
    or jsonb_typeof(shipping_address_data) <> 'object'
    or jsonb_typeof(cart_items) <> 'array'
    or jsonb_array_length(cart_items) = 0
  then
    raise exception 'invalid order snapshots or cart items';
  end if;

  if not (customer_data ?& array['name', 'email'])
    or not (
      shipping_address_data ?& array[
        'recipient_name',
        'postal_code',
        'street',
        'number',
        'neighborhood',
        'city',
        'state'
      ]
    )
    or nullif(btrim(customer_data ->> 'name'), '') is null
    or nullif(btrim(customer_data ->> 'email'), '') is null
    or nullif(btrim(shipping_address_data ->> 'recipient_name'), '') is null
    or nullif(btrim(shipping_address_data ->> 'street'), '') is null
    or nullif(btrim(shipping_address_data ->> 'number'), '') is null
    or nullif(btrim(shipping_address_data ->> 'neighborhood'), '') is null
    or nullif(btrim(shipping_address_data ->> 'city'), '') is null
    or coalesce(shipping_address_data ->> 'postal_code', '') !~ '^[0-9]{8}$'
    or coalesce(shipping_address_data ->> 'state', '') !~ '^[A-Z]{2}$'
  then
    raise exception 'customer or shipping address snapshot is incomplete';
  end if;

  if shipping_cost_cents < 0 or discount_cents < 0 then
    raise exception 'order amounts cannot be negative';
  end if;

  insert into public.orders (
    customer_id,
    customer_snapshot,
    shipping_address_snapshot,
    idempotency_key
  )
  values (
    customer_profile_id,
    customer_data,
    shipping_address_data,
    request_idempotency_key
  )
  returning id into created_order_id;

  -- Itens repetidos no JSON sao consolidados antes do bloqueio.
  for cart_item in
    select parsed.product_id, sum(parsed.quantity)::bigint as quantity
    from jsonb_to_recordset(cart_items) as parsed(product_id uuid, quantity integer)
    group by parsed.product_id
    order by parsed.product_id
  loop
    if cart_item.product_id is null
      or cart_item.quantity is null
      or cart_item.quantity <= 0
      or cart_item.quantity > 1000
    then
      raise exception 'cart items require a product and a quantity between 1 and 1000';
    end if;

    select *
    into current_product
    from public.products
    where id = cart_item.product_id
    for update;

    if not found then
      raise exception 'product % not found', cart_item.product_id;
    end if;

    if current_product.checkout_status <> 'available'
      or current_product.producer_id is null
      or current_product.weight_grams is null
      or current_product.height_cm is null
      or current_product.width_cm is null
      or current_product.length_cm is null
    then
      raise exception 'product % is incomplete or unavailable for checkout', current_product.id;
    end if;

    perform 1
    from public.producer_fulfillment_profiles
    where producer_id = current_product.producer_id
      and is_active;

    if not found then
      raise exception 'producer % has no active fulfillment profile', current_product.producer_id;
    end if;

    unit_price_cents := round(current_product.price * 100)::bigint;
    subtotal_cents := subtotal_cents + unit_price_cents * cart_item.quantity;

    insert into public.order_items (
      order_id,
      product_id,
      producer_id,
      product_name,
      product_snapshot,
      unit_price_cents,
      quantity
    )
    values (
      created_order_id,
      current_product.id,
      current_product.producer_id,
      current_product.name,
      jsonb_build_object(
        'name', current_product.name,
        'category', current_product.category,
        'image', current_product.image,
        'weight_grams', current_product.weight_grams,
        'height_cm', current_product.height_cm,
        'width_cm', current_product.width_cm,
        'length_cm', current_product.length_cm
      ),
      unit_price_cents,
      cart_item.quantity
    );
  end loop;

  if subtotal_cents = 0 or discount_cents > subtotal_cents + shipping_cost_cents then
    raise exception 'invalid order total';
  end if;

  update public.orders
  set
    subtotal_amount_cents = subtotal_cents,
    shipping_amount_cents = shipping_cost_cents,
    discount_amount_cents = discount_cents,
    total_amount_cents = subtotal_cents + shipping_cost_cents - discount_cents
  where id = created_order_id;

  insert into public.shipments (
    order_id,
    producer_id,
    origin_address_snapshot,
    destination_address_snapshot
  )
  select distinct on (item.producer_id)
    created_order_id,
    item.producer_id,
    jsonb_build_object(
      'postal_code', profile.origin_postal_code,
      'street', profile.origin_street,
      'number', profile.origin_number,
      'complement', profile.origin_complement,
      'neighborhood', profile.origin_neighborhood,
      'city', profile.origin_city,
      'state', profile.origin_state,
      'contact_name', profile.contact_name,
      'contact_phone', profile.contact_phone
    ),
    shipping_address_data
  from public.order_items as item
  join public.producer_fulfillment_profiles as profile
    on profile.producer_id = item.producer_id
  where item.order_id = created_order_id
  order by item.producer_id;

  insert into public.order_events (order_id, event_type, payload)
  values (
    created_order_id,
    'order_created',
    jsonb_build_object('idempotency_key', request_idempotency_key)
  );

  perform *
  from public.reserve_order_inventory(created_order_id, reservation_expires_at);

  return created_order_id;
end;
$$;

create or replace function public.expire_inventory_reservations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  if auth.role() <> 'service_role'
    and not public.has_role('super_admin'::public.app_role)
  then
    raise exception 'reservation expiration requires an administrative backend';
  end if;

  with expired as (
    update public.inventory_reservations
    set
      status = 'expired',
      released_at = now(),
      release_reason = 'reservation_expired'
    where status = 'active'
      and expires_at <= now()
    returning order_id
  ), affected_orders as (
    update public.orders as target
    set status = 'expired'
    where target.status = 'awaiting_payment'
      and target.id in (select order_id from expired)
      and not exists (
        select 1
        from public.inventory_reservations as active
        where active.order_id = target.id
          and active.status = 'active'
          and active.expires_at > now()
      )
    returning target.id
  )
  select count(*) into expired_count from expired;

  return expired_count;
end;
$$;

alter table public.customer_profiles enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.producer_fulfillment_profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.shipments enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.refunds enable row level security;
alter table public.order_events enable row level security;
alter table public.webhook_events enable row level security;
alter table public.fulfillment_jobs enable row level security;

create policy "Customers and admins can read customer profiles"
  on public.customer_profiles for select
  to authenticated
  using (id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Customers can update their profile"
  on public.customer_profiles for update
  to authenticated
  using (id = auth.uid() or public.has_role('super_admin'::public.app_role))
  with check (id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Customers can read their addresses"
  on public.customer_addresses for select
  to authenticated
  using (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Customers can create their addresses"
  on public.customer_addresses for insert
  to authenticated
  with check (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Customers can update their addresses"
  on public.customer_addresses for update
  to authenticated
  using (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role))
  with check (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Customers can delete their addresses"
  on public.customer_addresses for delete
  to authenticated
  using (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Producers and admins can read fulfillment profiles"
  on public.producer_fulfillment_profiles for select
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
  );

create policy "Producers and admins can create fulfillment profiles"
  on public.producer_fulfillment_profiles for insert
  to authenticated
  with check (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
  );

create policy "Producers and admins can update fulfillment profiles"
  on public.producer_fulfillment_profiles for update
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
  )
  with check (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
  );

create policy "Customers and admins can read orders"
  on public.orders for select
  to authenticated
  using (customer_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Order participants can read items"
  on public.order_items for select
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
    or exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.customer_id = auth.uid()
    )
  );

create policy "Producers and admins can read shipments"
  on public.shipments for select
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or public.can_manage_producer(producer_id)
  );

create policy "Catalog managers can read inventory reservations"
  on public.inventory_reservations for select
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or exists (
      select 1
      from public.products
      where products.id = inventory_reservations.product_id
        and public.can_manage_producer(products.producer_id)
    )
  );

create policy "Admins can read payment attempts"
  on public.payment_attempts for select
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

create policy "Admins can read refunds"
  on public.refunds for select
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

create policy "Admins can read order events"
  on public.order_events for select
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

create policy "Admins can read webhook events"
  on public.webhook_events for select
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

create policy "Admins can read fulfillment jobs"
  on public.fulfillment_jobs for select
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

revoke all on table
  public.customer_profiles,
  public.customer_addresses,
  public.producer_fulfillment_profiles,
  public.orders,
  public.order_items,
  public.shipments,
  public.inventory_reservations,
  public.payment_attempts,
  public.refunds,
  public.order_events,
  public.webhook_events,
  public.fulfillment_jobs
from anon, authenticated;

grant select, update on public.customer_profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses to authenticated;
grant select, insert, update on public.producer_fulfillment_profiles to authenticated;
grant select on
  public.orders,
  public.order_items,
  public.shipments,
  public.inventory_reservations,
  public.payment_attempts,
  public.refunds,
  public.order_events,
  public.webhook_events,
  public.fulfillment_jobs
to authenticated;

grant all on table
  public.customer_profiles,
  public.customer_addresses,
  public.producer_fulfillment_profiles,
  public.orders,
  public.order_items,
  public.shipments,
  public.inventory_reservations,
  public.payment_attempts,
  public.refunds,
  public.order_events,
  public.webhook_events,
  public.fulfillment_jobs
to service_role;

grant usage, select on all sequences in schema public to service_role;
grant usage, select on sequence public.orders_order_number_seq to authenticated;
grant usage, select on sequence public.order_events_id_seq to authenticated;

revoke all on function public.reserve_order_inventory(uuid, timestamptz) from public;
revoke all on function public.create_order_with_inventory(uuid, jsonb, jsonb, jsonb, text, bigint, bigint, timestamptz) from public;
revoke all on function public.expire_inventory_reservations() from public;
grant execute on function public.reserve_order_inventory(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.create_order_with_inventory(uuid, jsonb, jsonb, jsonb, text, bigint, bigint, timestamptz) to authenticated, service_role;
grant execute on function public.expire_inventory_reservations() to authenticated, service_role;
