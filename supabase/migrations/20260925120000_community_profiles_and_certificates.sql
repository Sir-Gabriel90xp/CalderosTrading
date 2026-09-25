-- Datos comunitarios separados de profiles para no exponer email, teléfono ni rol.
create table public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  country text not null default '' check (char_length(country) <= 80),
  bio text not null default '' check (char_length(bio) <= 600),
  instagram_url text check (
    instagram_url is null or
    instagram_url ~* '^https?://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$'
  ),
  funded_accounts_count integer not null default 0 check (funded_accounts_count between 0 and 100),
  trading_capital_usd numeric(14,2) not null default 0 check (trading_capital_usd >= 0),
  avatar_path text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_avatar_belongs_to_owner check (
    avatar_path is null or avatar_path like (user_id::text || '/%')
  )
);

create table public.trading_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  issuer text not null default '' check (char_length(issuer) <= 100),
  file_path text not null unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint certificate_file_belongs_to_owner check (
    file_path like (user_id::text || '/%')
  )
);

create index community_profiles_leaderboard_idx
  on public.community_profiles (trading_capital_usd desc, updated_at desc)
  where is_public = true;
create index trading_certificates_community_idx
  on public.trading_certificates (user_id, created_at desc)
  where is_public = true;

alter table public.community_profiles enable row level security;
alter table public.trading_certificates enable row level security;

create policy community_profiles_read on public.community_profiles
  for select to authenticated
  using (user_id = (select auth.uid()) or is_public or private.has_role(array['super_admin','admin','support']));
create policy community_profiles_insert on public.community_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy community_profiles_update on public.community_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy trading_certificates_read on public.trading_certificates
  for select to authenticated
  using (
    user_id = (select auth.uid()) or
    (is_public and exists (
      select 1 from public.community_profiles cp
      where cp.user_id = trading_certificates.user_id and cp.is_public
    ))
  );
create policy trading_certificates_insert on public.trading_certificates
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and
    file_path like ((select auth.uid())::text || '/%')
  );
create policy trading_certificates_update on public.trading_certificates
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and
    file_path like ((select auth.uid())::text || '/%')
  );
create policy trading_certificates_delete on public.trading_certificates
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update on public.community_profiles to authenticated;
grant select, insert, update, delete on public.trading_certificates to authenticated;

-- Filas privadas por defecto para las cuentas que ya existen.
insert into public.community_profiles (user_id, display_name)
select id, coalesce(full_name, '') from public.profiles
on conflict (user_id) do nothing;

-- Crear también la ficha vacía en cada registro futuro.
create or replace function private.on_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, email, full_name)
  values(new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''));

  insert into public.community_profiles(user_id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Avatares y certificados permanecen en buckets privados. Los enlaces firmados
-- de la comunidad se generan solo al mostrar una ficha/certificado compartido.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars', 'profile-avatars', false, 5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trading-certificates', 'trading-certificates', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy community_avatar_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or
      exists (
        select 1 from public.community_profiles cp
        where cp.avatar_path = storage.objects.name and cp.is_public
      )
    )
  );
create policy community_avatar_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile-avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy community_avatar_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'profile-avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy community_avatar_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'profile-avatars' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy trading_certificate_file_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'trading-certificates' and (
      (storage.foldername(name))[1] = (select auth.uid())::text or
      exists (
        select 1
        from public.trading_certificates tc
        join public.community_profiles cp on cp.user_id = tc.user_id
        where tc.file_path = storage.objects.name
          and tc.is_public and cp.is_public
      )
    )
  );
create policy trading_certificate_file_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'trading-certificates' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy trading_certificate_file_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'trading-certificates' and
    (storage.foldername(name))[1] = (select auth.uid())::text
  );
