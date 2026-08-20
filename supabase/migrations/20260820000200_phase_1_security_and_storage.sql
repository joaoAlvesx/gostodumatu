-- Fase 1: papeis protegidos, perfis, RLS e Storage do catalogo.

alter table public.producers add column if not exists bio text;
alter table public.producers add column if not exists image text;
alter table public.producers add column if not exists location text;
alter table public.producers add column if not exists user_id uuid;
alter table public.producers add column if not exists created_at timestamptz not null default now();
alter table public.producers add column if not exists updated_at timestamptz not null default now();
alter table public.products add column if not exists description text;
alter table public.products add column if not exists is_new boolean not null default false;
alter table public.products add column if not exists producer_id uuid;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.producers'::regclass
      and contype = 'f'
      and conname = 'producers_user_id_fkey'
  ) then
    alter table public.producers
      add constraint producers_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end
$$;

do $$
begin
  create type public.app_role as enum ('super_admin', 'producer');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Converte uma unica vez o papel legado (editavel no cliente) em um registro
-- protegido por RLS. Depois desta migration, o frontend ignora user_metadata.
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where raw_user_meta_data ->> 'role' = 'super_admin'
on conflict (user_id, role) do nothing;

insert into public.user_roles (user_id, role)
select user_id, 'producer'::public.app_role
from public.producers
where user_id is not null
on conflict (user_id, role) do nothing;

create or replace function public.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = required_role
  );
$$;

create or replace function public.can_manage_producer(target_producer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.has_role('super_admin'::public.app_role)
    or exists (
      select 1
      from public.producers
      where id = target_producer_id
        and user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_catalog_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folders text[] := storage.foldername(object_name);
  owner_id uuid;
begin
  if public.has_role('super_admin'::public.app_role) then
    return true;
  end if;

  if coalesce(array_length(folders, 1), 0) < 2 then
    return false;
  end if;

  if folders[1] not in ('products', 'producers') then
    return false;
  end if;

  owner_id := folders[2]::uuid;
  return public.can_manage_producer(owner_id);
exception
  when invalid_text_representation then
    return false;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'full_name')
from auth.users
on conflict (id) do nothing;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_producers_updated_at on public.producers;
create trigger set_producers_updated_at
  before update on public.producers
  for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create or replace function public.protect_catalog_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() = 'service_role' or public.has_role('super_admin'::public.app_role) then
    return new;
  end if;

  if tg_table_name = 'producers' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'producer ownership cannot be changed';
    end if;
  elsif tg_table_name = 'products' then
    if new.id is distinct from old.id or new.producer_id is distinct from old.producer_id then
      raise exception 'product ownership cannot be changed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_producer_ownership on public.producers;
create trigger protect_producer_ownership
  before update on public.producers
  for each row execute function public.protect_catalog_ownership();

drop trigger if exists protect_product_ownership on public.products;
create trigger protect_product_ownership
  before update on public.products
  for each row execute function public.protect_catalog_ownership();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.producers enable row level security;
alter table public.products enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_roles', 'producers', 'products')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

create policy "Public can read producers"
  on public.producers for select
  to anon, authenticated
  using (true);

create policy "Super admins can create producers"
  on public.producers for insert
  to authenticated
  with check (public.has_role('super_admin'::public.app_role));

create policy "Owners and super admins can update producers"
  on public.producers for update
  to authenticated
  using (public.can_manage_producer(id))
  with check (public.can_manage_producer(id));

create policy "Super admins can delete producers"
  on public.producers for delete
  to authenticated
  using (public.has_role('super_admin'::public.app_role));

create policy "Public can read products"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "Owners and super admins can create products"
  on public.products for insert
  to authenticated
  with check (
    public.has_role('super_admin'::public.app_role)
    or (producer_id is not null and public.can_manage_producer(producer_id))
  );

create policy "Owners and super admins can update products"
  on public.products for update
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or (producer_id is not null and public.can_manage_producer(producer_id))
  )
  with check (
    public.has_role('super_admin'::public.app_role)
    or (producer_id is not null and public.can_manage_producer(producer_id))
  );

create policy "Owners and super admins can delete products"
  on public.products for delete
  to authenticated
  using (
    public.has_role('super_admin'::public.app_role)
    or (producer_id is not null and public.can_manage_producer(producer_id))
  );

create policy "Users can read their profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid() or public.has_role('super_admin'::public.app_role))
  with check (id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Users can read their roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid() or public.has_role('super_admin'::public.app_role));

create policy "Super admins can manage roles"
  on public.user_roles for all
  to authenticated
  using (public.has_role('super_admin'::public.app_role))
  with check (public.has_role('super_admin'::public.app_role));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read catalog images" on storage.objects;
drop policy if exists "Catalog managers can upload images" on storage.objects;
drop policy if exists "Catalog managers can update images" on storage.objects;
drop policy if exists "Catalog managers can delete images" on storage.objects;

create policy "Public can read catalog images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'catalog-images');

create policy "Catalog managers can upload images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_object(name)
  );

create policy "Catalog managers can update images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_object(name)
  )
  with check (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_object(name)
  );

create policy "Catalog managers can delete images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'catalog-images'
    and public.can_manage_catalog_object(name)
  );

revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.can_manage_producer(uuid) from public;
revoke all on function public.can_manage_catalog_object(text) from public;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.can_manage_producer(uuid) to authenticated;
grant execute on function public.can_manage_catalog_object(text) to authenticated;

grant select on public.producers, public.products to anon, authenticated;
grant insert, update, delete on public.producers, public.products to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.profiles, public.user_roles, public.producers, public.products to service_role;

-- O primeiro super admin deve ser promovido uma unica vez pelo SQL Editor:
-- insert into public.user_roles (user_id, role)
-- select id, 'super_admin'::public.app_role from auth.users where email = '<email-do-admin>';
