-- Fase 4: OAuth e cotacoes multi-origem do Melhor Envio.

create extension if not exists supabase_vault with schema vault;

alter type public.shipment_status add value if not exists 'label_error' after 'label_pending';

create table if not exists public.melhor_envio_oauth_states (
  state_hash text primary key check (length(state_hash) = 64),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists melhor_envio_oauth_states_expires_at_idx
  on public.melhor_envio_oauth_states (expires_at);

create table if not exists public.melhor_envio_oauth_connections (
  id text primary key default 'default' check (id = 'default'),
  access_token_secret_id uuid not null,
  refresh_token_secret_id uuid not null,
  token_type text not null default 'Bearer',
  scope text,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  refresh_locked_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (refresh_expires_at > access_expires_at)
);

create table if not exists public.shipping_quote_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  destination_postal_code text not null check (destination_postal_code ~ '^[0-9]{8}$'),
  cart_fingerprint text not null check (length(cart_fingerprint) = 64),
  cart_snapshot jsonb not null check (jsonb_typeof(cart_snapshot) = 'array'),
  quotes_snapshot jsonb not null check (jsonb_typeof(quotes_snapshot) = 'array'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists shipping_quote_sessions_customer_created_idx
  on public.shipping_quote_sessions (customer_id, created_at desc);
create index if not exists shipping_quote_sessions_expires_at_idx
  on public.shipping_quote_sessions (expires_at);

alter table public.shipments
  add column if not exists quote_session_id uuid references public.shipping_quote_sessions(id) on delete set null,
  add column if not exists service_id integer,
  add column if not exists quoted_at timestamptz,
  add column if not exists label_error text,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.shipments
    add constraint shipments_provider_metadata_object_check
    check (jsonb_typeof(provider_metadata) = 'object');
exception
  when duplicate_object then null;
end
$$;

create or replace function public.store_melhor_envio_oauth_tokens(
  access_token text,
  refresh_token text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  token_type text default 'Bearer',
  granted_scope text default null,
  connected_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  access_secret_id uuid;
  refresh_secret_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  if nullif(access_token, '') is null
    or nullif(refresh_token, '') is null
    or access_expires_at <= now()
    or refresh_expires_at <= access_expires_at
  then
    raise exception 'invalid Melhor Envio OAuth tokens';
  end if;

  select id into access_secret_id
  from vault.secrets
  where name = 'melhor_envio_access_token';

  if access_secret_id is null then
    select vault.create_secret(
      access_token,
      'melhor_envio_access_token',
      'Access token rotativo da integracao Melhor Envio'
    ) into access_secret_id;
  else
    perform vault.update_secret(access_secret_id, access_token);
  end if;

  select id into refresh_secret_id
  from vault.secrets
  where name = 'melhor_envio_refresh_token';

  if refresh_secret_id is null then
    select vault.create_secret(
      refresh_token,
      'melhor_envio_refresh_token',
      'Refresh token rotativo da integracao Melhor Envio'
    ) into refresh_secret_id;
  else
    perform vault.update_secret(refresh_secret_id, refresh_token);
  end if;

  insert into public.melhor_envio_oauth_connections (
    id,
    access_token_secret_id,
    refresh_token_secret_id,
    token_type,
    scope,
    access_expires_at,
    refresh_expires_at,
    refresh_locked_at,
    connected_by
  )
  values (
    'default',
    access_secret_id,
    refresh_secret_id,
    coalesce(nullif(token_type, ''), 'Bearer'),
    granted_scope,
    access_expires_at,
    refresh_expires_at,
    null,
    connected_by
  )
  on conflict (id) do update set
    access_token_secret_id = excluded.access_token_secret_id,
    refresh_token_secret_id = excluded.refresh_token_secret_id,
    token_type = excluded.token_type,
    scope = excluded.scope,
    access_expires_at = excluded.access_expires_at,
    refresh_expires_at = excluded.refresh_expires_at,
    refresh_locked_at = null,
    connected_by = coalesce(excluded.connected_by, public.melhor_envio_oauth_connections.connected_by),
    connected_at = case
      when excluded.connected_by is not null then now()
      else public.melhor_envio_oauth_connections.connected_at
    end,
    updated_at = now();
end;
$$;

create or replace function public.get_melhor_envio_oauth_tokens()
returns table (
  access_token text,
  refresh_token text,
  token_type text,
  scope text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  return query
    select
      access_secret.decrypted_secret,
      refresh_secret.decrypted_secret,
      connection.token_type,
      connection.scope,
      connection.access_expires_at,
      connection.refresh_expires_at
    from public.melhor_envio_oauth_connections as connection
    join vault.decrypted_secrets as access_secret
      on access_secret.id = connection.access_token_secret_id
    join vault.decrypted_secrets as refresh_secret
      on refresh_secret.id = connection.refresh_token_secret_id
    where connection.id = 'default';
end;
$$;

create or replace function public.claim_melhor_envio_token_refresh()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.melhor_envio_oauth_connections
  set refresh_locked_at = now()
  where id = 'default'
    and (refresh_locked_at is null or refresh_locked_at < now() - interval '2 minutes');

  get diagnostics claimed_count = row_count;
  return claimed_count > 0;
end;
$$;

create or replace function public.release_melhor_envio_token_refresh()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.melhor_envio_oauth_connections
  set refresh_locked_at = null
  where id = 'default';
end;
$$;

create or replace function public.consume_melhor_envio_oauth_state(request_state_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_owner uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  update public.melhor_envio_oauth_states
  set consumed_at = now()
  where state_hash = request_state_hash
    and consumed_at is null
    and expires_at > now()
  returning created_by into state_owner;

  delete from public.melhor_envio_oauth_states
  where expires_at < now() - interval '1 day';

  return state_owner;
end;
$$;

create or replace function public.delete_expired_shipping_quotes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  delete from public.shipping_quote_sessions
  where expires_at < now() - interval '1 day';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

alter table public.melhor_envio_oauth_states enable row level security;
alter table public.melhor_envio_oauth_connections enable row level security;
alter table public.shipping_quote_sessions enable row level security;

revoke all on table vault.secrets, vault.decrypted_secrets from anon, authenticated;

revoke all on table
  public.melhor_envio_oauth_states,
  public.melhor_envio_oauth_connections,
  public.shipping_quote_sessions
from anon, authenticated;

grant all on table
  public.melhor_envio_oauth_states,
  public.melhor_envio_oauth_connections,
  public.shipping_quote_sessions
to service_role;

revoke all on function public.store_melhor_envio_oauth_tokens(text, text, timestamptz, timestamptz, text, text, uuid) from public;
revoke all on function public.get_melhor_envio_oauth_tokens() from public;
revoke all on function public.claim_melhor_envio_token_refresh() from public;
revoke all on function public.release_melhor_envio_token_refresh() from public;
revoke all on function public.consume_melhor_envio_oauth_state(text) from public;
revoke all on function public.delete_expired_shipping_quotes() from public;

grant execute on function public.store_melhor_envio_oauth_tokens(text, text, timestamptz, timestamptz, text, text, uuid) to service_role;
grant execute on function public.get_melhor_envio_oauth_tokens() to service_role;
grant execute on function public.claim_melhor_envio_token_refresh() to service_role;
grant execute on function public.release_melhor_envio_token_refresh() to service_role;
grant execute on function public.consume_melhor_envio_oauth_state(text) to service_role;
grant execute on function public.delete_expired_shipping_quotes() to service_role;
