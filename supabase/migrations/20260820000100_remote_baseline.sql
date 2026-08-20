-- Baseline do schema consumido pelo frontend antes do checkout.
-- Os IF NOT EXISTS permitem registrar a migration no projeto remoto que ja possui
-- essas tabelas e tambem reproduzir a base em um projeto Supabase vazio.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.producers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  bio text,
  image text,
  location text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists producers_slug_key on public.producers (slug);
create unique index if not exists producers_user_id_key
  on public.producers (user_id)
  where user_id is not null;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(12, 2) not null check (price >= 0),
  original_price numeric(12, 2) check (original_price is null or original_price >= 0),
  image text[] not null default '{}'::text[],
  category text not null,
  description text,
  is_new boolean not null default false,
  producer_id uuid references public.producers(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_producer_id_idx on public.products (producer_id);
create index if not exists products_created_at_idx on public.products (created_at desc);
