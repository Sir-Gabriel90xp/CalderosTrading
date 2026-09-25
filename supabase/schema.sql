-- Ejecutar en SQL Editor del proyecto Supabase antes de iniciar la aplicación.
create extension if not exists pgcrypto;
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null, full_name text not null default '', phone text,
  role text not null default 'student' check (role in ('student','support','instructor','admin','super_admin')),
  created_at timestamptz not null default now()
);
-- La ficha comunitaria está separada de profiles para mantener privados email, teléfono y rol.
create table public.community_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  country text not null default '' check (char_length(country) <= 80),
  bio text not null default '' check (char_length(bio) <= 600),
  instagram_url text check (instagram_url is null or instagram_url ~* '^https?://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$'),
  funded_accounts_count integer not null default 0 check (funded_accounts_count between 0 and 100),
  trading_capital_usd numeric(14,2) not null default 0 check (trading_capital_usd >= 0),
  avatar_path text,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_avatar_belongs_to_owner check (avatar_path is null or avatar_path like (user_id::text || '/%'))
);
create table public.trading_certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 100),
  issuer text not null default '' check (char_length(issuer) <= 100),
  file_path text not null unique,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  constraint certificate_file_belongs_to_owner check (file_path like (user_id::text || '/%'))
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  title text not null, description text not null default '', cover_url text,
  level text not null default 'Inicial', price numeric(12,2) not null default 0 check (price >= 0),
  paypal_usd_price numeric(12,2) check (paypal_usd_price > 0),
  instructor_id uuid references public.profiles(id), published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.modules (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses(id) on delete cascade,
  title text not null, position int not null default 0
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references public.modules(id) on delete cascade,
  title text not null, body text not null default '', video_url text, position int not null default 0,
  published boolean not null default false, preview boolean not null default false
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  starts_at timestamptz not null default now(), expires_at timestamptz,
  access_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  status text not null default 'active' check(status in ('active','suspended','pending')),
  unique(user_id,course_id)
);
create table public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed_at timestamptz not null default now(), primary key(user_id,lesson_id)
);
create table public.bank_transfers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  course_id uuid not null references public.courses(id), amount numeric(12,2) not null check(amount>=0),
  bank text not null, reference text not null, receipt_path text not null, currency_code text not null default 'DOP' check(currency_code in ('DOP','USD')),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), reviewed_at timestamptz
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id), body text not null check(length(body)<=2000),
  created_at timestamptz not null default now(), read_at timestamptz
);
create table public.settings (key text primary key, value text not null default '');
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
 action text not null, target_id uuid, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 course_id uuid not null references public.courses(id), amount numeric(12,2) not null,
 provider text not null, provider_order_id text unique, status text not null default 'pending',
 created_at timestamptz not null default now()
);

create index on public.modules(course_id,position);
create index on public.lessons(module_id,position);
create index on public.enrollments(user_id,expires_at);
create index on public.bank_transfers(status,created_at);
create index on public.messages(recipient_id,created_at desc);
create index community_profiles_leaderboard_idx on public.community_profiles(trading_capital_usd desc,updated_at desc) where is_public=true;
create index trading_certificates_community_idx on public.trading_certificates(user_id,created_at desc) where is_public=true;

-- Los roles jamás se leen de metadatos editables por el usuario.
create function private.has_role(allowed text[]) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=(select auth.uid()) and role=any(allowed));
$$;
revoke all on function private.has_role(text[]) from public, anon;
grant usage on schema private to anon, authenticated;
grant execute on function private.has_role(text[]) to anon, authenticated;

create function private.has_access(p_course uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(
   select 1 from public.enrollments e
   where e.user_id=(select auth.uid())
     and e.course_id=p_course
     and e.status='active'
     and (e.expires_at is null or e.expires_at>now())
 );
$$;
revoke all on function private.has_access(uuid) from public, anon;
grant execute on function private.has_access(uuid) to authenticated;

create function private.on_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
 begin
   insert into public.profiles(id,email,full_name) values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''));
   insert into public.community_profiles(user_id,display_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''));
   return new;
 end;
$$;
create trigger create_profile after insert on auth.users for each row execute function private.on_auth_user();

alter table public.profiles enable row level security;
alter table public.community_profiles enable row level security;
alter table public.trading_certificates enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.bank_transfers enable row level security;
alter table public.messages enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.payments enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()) or private.has_role(array['super_admin','admin','instructor','support']));
create policy community_profiles_read on public.community_profiles for select to authenticated using(user_id=(select auth.uid()) or is_public or private.has_role(array['super_admin','admin','support']));
create policy community_profiles_insert on public.community_profiles for insert to authenticated with check(user_id=(select auth.uid()));
create policy community_profiles_update on public.community_profiles for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy trading_certificates_read on public.trading_certificates for select to authenticated using(
 user_id=(select auth.uid()) or (is_public and exists(select 1 from public.community_profiles cp where cp.user_id=trading_certificates.user_id and cp.is_public))
);
create policy trading_certificates_insert on public.trading_certificates for insert to authenticated with check(user_id=(select auth.uid()) and file_path like ((select auth.uid())::text || '/%'));
create policy trading_certificates_update on public.trading_certificates for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and file_path like ((select auth.uid())::text || '/%'));
create policy trading_certificates_delete on public.trading_certificates for delete to authenticated using(user_id=(select auth.uid()));
create policy courses_read on public.courses for select to anon,authenticated using(published or private.has_role(array['super_admin','admin','instructor','support']));
create policy courses_enrolled_read on public.courses for select to authenticated using(private.has_access(id));
create policy courses_write on public.courses for all to authenticated using(private.has_role(array['super_admin','admin','instructor'])) with check(private.has_role(array['super_admin','admin','instructor']));
create policy modules_read on public.modules for select to anon,authenticated using(exists(select 1 from public.courses c where c.id=course_id and (c.published or private.has_role(array['super_admin','admin','instructor','support']))));
create policy modules_enrolled_read on public.modules for select to authenticated using(private.has_access(course_id));
create policy modules_anon_preview on public.modules for select to anon using(
  exists(select 1 from public.courses c where c.id=course_id and c.published=true)
);
create policy modules_write on public.modules for all to authenticated using(private.has_role(array['super_admin','admin','instructor'])) with check(private.has_role(array['super_admin','admin','instructor']));
create policy lessons_read on public.lessons for select to authenticated using(
 private.has_role(array['super_admin','admin','instructor','support']) or
 (
   published and exists(
     select 1 from public.modules m
     where m.id=module_id and (preview or private.has_access(m.course_id))
   )
 )
);
create policy lessons_read_anon on public.lessons for select to anon using(
  published and exists(
    select 1 from public.modules m
    where m.id=module_id and preview = true
  )
);
create policy lessons_write on public.lessons for all to authenticated using(private.has_role(array['super_admin','admin','instructor'])) with check(private.has_role(array['super_admin','admin','instructor']));
create policy enrollments_read on public.enrollments for select to authenticated using(user_id=(select auth.uid()) or private.has_role(array['super_admin','admin','support']));
create policy enrollments_admin_insert on public.enrollments for insert to authenticated with check(private.has_role(array['super_admin','admin']));
create policy enrollments_admin_update on public.enrollments for update to authenticated using(private.has_role(array['super_admin','admin'])) with check(private.has_role(array['super_admin','admin']));
create policy progress_read on public.lesson_progress for select to authenticated using(user_id=(select auth.uid()) or private.has_role(array['super_admin','admin','instructor','support']));
create policy progress_insert on public.lesson_progress for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=lesson_id and l.published and private.has_access(m.course_id)));
create policy progress_update on public.lesson_progress for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy transfers_read on public.bank_transfers for select to authenticated using(user_id=(select auth.uid()) or private.has_role(array['super_admin','admin','support']));
create policy transfers_insert on public.bank_transfers for insert to authenticated with check(user_id=(select auth.uid()) and status='pending' and exists(select 1 from public.courses c where c.id=bank_transfers.course_id and c.published and ((bank_transfers.currency_code='DOP' and c.price=bank_transfers.amount) or (bank_transfers.currency_code='USD' and c.paypal_usd_price=bank_transfers.amount))));
create policy messages_read on public.messages for select to authenticated using(sender_id=(select auth.uid()) or recipient_id=(select auth.uid()) or private.has_role(array['super_admin','admin','support']));
create policy messages_insert on public.messages for insert to authenticated with check(sender_id=(select auth.uid()) and (private.has_role(array['super_admin','admin','support']) or private.has_role(array['super_admin','admin','support'])=false and exists(select 1 from public.profiles p where p.id=recipient_id and p.role in ('super_admin','admin','support'))));
create policy settings_read on public.settings for select to authenticated using(
 private.has_role(array['super_admin','admin']) or key in ('bank_name','bank_account','bank_holder') or
 key='paypal_payment_link' or (key='whatsapp_group' and exists(select 1 from public.enrollments e where e.user_id=(select auth.uid()) and e.status='active' and (e.expires_at is null or e.expires_at>now())))
);
create policy settings_write on public.settings for all to authenticated using(private.has_role(array['super_admin','admin'])) with check(private.has_role(array['super_admin','admin']));
create policy audit_read on public.audit_logs for select to authenticated using(private.has_role(array['super_admin','admin']));
create policy payments_read on public.payments for select to authenticated using(user_id=(select auth.uid()) or private.has_role(array['super_admin','admin','support']));

-- Bucket privado: la ruta siempre comienza con el ID del usuario que sube.
-- Bucket público para portadas administradas desde /admin/cursos.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('course-covers','course-covers',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy course_cover_upload on storage.objects for insert to authenticated with check(bucket_id='course-covers' and private.has_role(array['super_admin','admin']));
create policy course_cover_update on storage.objects for update to authenticated using(bucket_id='course-covers' and private.has_role(array['super_admin','admin'])) with check(bucket_id='course-covers' and private.has_role(array['super_admin','admin']));
create policy course_cover_delete on storage.objects for delete to authenticated using(bucket_id='course-covers' and private.has_role(array['super_admin','admin']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('receipts','receipts',false,5242880,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
create policy receipt_upload on storage.objects for insert to authenticated with check(bucket_id='receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy receipt_read on storage.objects for select to authenticated using(bucket_id='receipts' and ((storage.foldername(name))[1]=(select auth.uid())::text or private.has_role(array['super_admin','admin','support'])));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-avatars','profile-avatars',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy community_avatar_read on storage.objects for select to authenticated using(bucket_id='profile-avatars' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(select 1 from public.community_profiles cp where cp.avatar_path=storage.objects.name and cp.is_public)));
create policy community_avatar_upload on storage.objects for insert to authenticated with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy community_avatar_update on storage.objects for update to authenticated using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy community_avatar_delete on storage.objects for delete to authenticated using(bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('trading-certificates','trading-certificates',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy trading_certificate_file_read on storage.objects for select to authenticated using(
 bucket_id='trading-certificates' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(
  select 1 from public.trading_certificates tc join public.community_profiles cp on cp.user_id=tc.user_id
  where tc.file_path=storage.objects.name and tc.is_public and cp.is_public
 ))
);
create policy trading_certificate_file_upload on storage.objects for insert to authenticated with check(bucket_id='trading-certificates' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy trading_certificate_file_delete on storage.objects for delete to authenticated using(bucket_id='trading-certificates' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Funciones RPC atómicas; autorizan por rol vigente en base de datos.
create function public.admin_grant_access(p_user uuid,p_course uuid,p_days integer) returns void language plpgsql security definer set search_path = '' as $$
 begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then raise exception 'Sin autorización'; end if;
 if p_days<1 or p_days>3650 then raise exception 'Duración inválida'; end if;
 insert into public.enrollments(user_id,course_id,starts_at,expires_at,status) values(p_user,p_course,now(),now()+make_interval(days=>p_days),'active')
 on conflict(user_id,course_id) do update set expires_at=case when public.enrollments.expires_at is null then null else greatest(public.enrollments.expires_at,now())+make_interval(days=>p_days) end,status='active';
 insert into public.audit_logs(actor_id,action,target_id,details) values((select auth.uid()),'grant_access',p_user,jsonb_build_object('course_id',p_course,'days',p_days));
 end;
$$;
revoke all on function public.admin_grant_access(uuid,uuid,integer) from public,anon;
grant execute on function public.admin_grant_access(uuid,uuid,integer) to authenticated;

create function public.admin_review_transfer(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path = '' as $$
 declare t public.bank_transfers%rowtype;
 begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then raise exception 'Sin autorización'; end if;
 select * into t from public.bank_transfers where id=p_id for update;
 if t.id is null or t.status<>'pending' then raise exception 'Transferencia no pendiente'; end if;
 update public.bank_transfers set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now() where id=p_id;
 if p_approve then
  insert into public.enrollments(user_id,course_id,expires_at,status) values(t.user_id,t.course_id,now()+interval '90 days','active')
  on conflict(user_id,course_id) do update set expires_at=case when public.enrollments.expires_at is null then null else greatest(public.enrollments.expires_at,now())+interval '90 days' end,status='active';
 end if;
 insert into public.audit_logs(actor_id,action,target_id) values((select auth.uid()),case when p_approve then 'approve_transfer' else 'reject_transfer' end,p_id);
 end;
$$;
revoke all on function public.admin_review_transfer(uuid,boolean) from public,anon;
grant execute on function public.admin_review_transfer(uuid,boolean) to authenticated;

-- La Data API puede requerir exposición explícita según configuración del proyecto.
grant select on public.courses,public.modules to anon;
grant select on public.profiles,public.courses,public.modules,public.lessons,public.enrollments,public.lesson_progress,public.bank_transfers,public.messages,public.settings,public.audit_logs,public.payments to authenticated;
grant select,insert,update on public.community_profiles to authenticated;
grant select,insert,update,delete on public.trading_certificates to authenticated;
grant insert,update,delete on public.courses,public.modules,public.lessons to authenticated;
grant insert,update on public.enrollments to authenticated;
grant insert,update on public.lesson_progress to authenticated;
grant insert on public.bank_transfers,public.messages to authenticated;
grant insert,update,delete on public.settings to authenticated;

-- Este RPC solo se invoca desde el servidor con clave secreta tras verificar captura en PayPal.
-- Cambios administrativos validados por rol dentro de Postgres.

create or replace function public.admin_update_profile(
  p_user uuid,
  p_full_name text,
  p_phone text,
  p_role text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_role(array['super_admin','admin']) then
    raise exception 'Sin autorización';
  end if;

  if p_role not in ('student','support','instructor','admin','super_admin') then
    raise exception 'Rol no válido';
  end if;

  if p_role = 'super_admin'
     and not private.has_role(array['super_admin']) then
    raise exception 'Solo un superadministrador puede asignar ese rol';
  end if;

  if exists (
    select 1 from public.profiles where id = p_user and role = 'super_admin'
  ) and p_role <> 'super_admin' and (
    select count(*) from public.profiles where role = 'super_admin'
  ) <= 1 then
    raise exception 'No se puede retirar el último superadministrador';
  end if;

  update public.profiles
  set full_name = btrim(p_full_name),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      role = p_role
  where id = p_user;

  if not found then raise exception 'Usuario no encontrado'; end if;

  insert into public.audit_logs(actor_id, action, target_id, details)
  values (
    (select auth.uid()),
    'admin_update_profile',
    p_user,
    jsonb_build_object('role', p_role, 'full_name', btrim(p_full_name))
  );
end;
$$;
revoke all on function public.admin_update_profile(uuid,text,text,text) from public, anon;
grant execute on function public.admin_update_profile(uuid,text,text,text) to authenticated;

create or replace function public.admin_moderate_community_profile(
  p_user uuid,
  p_display_name text,
  p_country text,
  p_bio text,
  p_instagram_url text,
  p_funded_accounts_count integer,
  p_trading_capital_usd numeric,
  p_is_public boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_instagram text := nullif(btrim(coalesce(p_instagram_url, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if (select auth.uid()) is null
     or not private.has_role(array['super_admin','admin']) then
    raise exception 'Sin autorización';
  end if;
  if char_length(btrim(coalesce(p_display_name, ''))) not between 2 and 80
     or char_length(coalesce(p_country, '')) > 80
     or char_length(coalesce(p_bio, '')) > 600
     or p_funded_accounts_count not between 0 and 100
     or p_trading_capital_usd is null
     or p_trading_capital_usd < 0
     or p_trading_capital_usd > 999999999999.99
     or char_length(coalesce(p_reason, '')) > 300 then
    raise exception 'Revisa los datos de moderación';
  end if;
  if v_instagram is not null and
     v_instagram !~* '^https?://(www\.)?instagram\.com/[A-Za-z0-9._]+/?$' then
    raise exception 'El enlace de Instagram no es válido';
  end if;

  update public.community_profiles
  set display_name = btrim(p_display_name),
      country = btrim(coalesce(p_country, '')),
      bio = btrim(coalesce(p_bio, '')),
      instagram_url = v_instagram,
      funded_accounts_count = p_funded_accounts_count,
      trading_capital_usd = p_trading_capital_usd,
      is_public = p_is_public,
      updated_at = now()
  where user_id = p_user;

  if not found then raise exception 'Perfil comunitario no encontrado'; end if;

  insert into public.audit_logs(actor_id, action, target_id, details)
  values (
    (select auth.uid()),
    'moderate_community_profile',
    p_user,
    jsonb_build_object(
      'reason', v_reason,
      'display_name', btrim(p_display_name),
      'is_public', p_is_public
    )
  );
end;
$$;
revoke all on function public.admin_moderate_community_profile(uuid,text,text,text,text,integer,numeric,boolean,text) from public, anon;
grant execute on function public.admin_moderate_community_profile(uuid,text,text,text,text,integer,numeric,boolean,text) to authenticated;

create or replace function public.admin_hide_trading_certificate(
  p_certificate uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if (select auth.uid()) is null
     or not private.has_role(array['super_admin','admin']) then
    raise exception 'Sin autorización';
  end if;
  if char_length(coalesce(p_reason, '')) > 300 then
    raise exception 'El motivo no puede superar 300 caracteres';
  end if;

  update public.trading_certificates
  set is_public = false
  where id = p_certificate
  returning user_id into v_user;
  if v_user is null then raise exception 'Certificado no encontrado'; end if;

  insert into public.audit_logs(actor_id, action, target_id, details)
  values (
    (select auth.uid()),
    'hide_trading_certificate',
    p_certificate,
    jsonb_build_object('user_id', v_user, 'reason', v_reason)
  );
end;
$$;
revoke all on function public.admin_hide_trading_certificate(uuid,text) from public, anon;
grant execute on function public.admin_hide_trading_certificate(uuid,text) to authenticated;

-- Chat de comunidad: salas privadas, acceso general/VIP, medios y moderación.
create table public.chat_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_scope text not null check (room_scope in ('general','vip','all')),
  muted_until timestamptz not null,
  reason text not null check (char_length(reason) between 3 and 300),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, room_scope)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room in ('general','vip')),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_type text not null check (message_type in ('text','sticker','audio')),
  body text,
  media_path text,
  author_name text not null default 'Trader',
  author_avatar_path text,
  author_role text not null default 'student',
  author_is_vip boolean not null default false,
  is_hidden boolean not null default false,
  media_duration_seconds smallint,
  hidden_by uuid references public.profiles(id),
  hidden_at timestamptz,
  moderation_reason text,
  created_at timestamptz not null default now(),
  constraint chat_message_payload_valid check (
    (message_type = 'text' and body is not null and char_length(btrim(body)) between 1 and 2000 and media_path is null)
    or (message_type = 'sticker' and ((media_path is not null and body is null) or (media_path is null and body is not null and char_length(body) between 1 and 24)))
    or (message_type = 'audio' and body is null and media_path is not null)
  ),
  constraint chat_message_duration_valid check (
    (message_type = 'audio' and media_duration_seconds between 1 and 60)
    or (message_type <> 'audio' and media_duration_seconds is null)
  ),
  constraint chat_message_media_path_valid check (
    media_path is null or media_path like (user_id::text || '/' || room || '/%')
  )
);

create index chat_messages_room_created_idx on public.chat_messages (room, created_at desc);
create index chat_messages_user_created_idx on public.chat_messages (user_id, created_at desc);
create index chat_mutes_active_user_idx on public.chat_mutes (user_id, room_scope, muted_until);

alter table public.chat_messages enable row level security;
alter table public.chat_mutes enable row level security;
revoke all on public.chat_messages, public.chat_mutes from public, anon, authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select on public.chat_mutes to authenticated;

create or replace function private.chat_is_muted(p_user uuid, p_room text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.chat_mutes m
    where m.user_id = p_user
      and m.room_scope in (p_room, 'all')
      and m.muted_until > statement_timestamp()
  );
$$;

create or replace function private.chat_can_access(p_room text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or p_room not in ('general','vip') then
    return false;
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user) then
    return false;
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_user and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) then
    return false;
  end if;

  if private.has_role(array['super_admin','admin']) then
    return true;
  end if;

  if private.chat_is_muted(v_user, p_room) then
    return false;
  end if;

  if p_room = 'general' then
    return true;
  end if;

  return exists (
    select 1 from public.enrollments e
    where e.user_id = v_user
      and e.status = 'active'
      and e.starts_at <= statement_timestamp()
      and (e.expires_at is null or e.expires_at > statement_timestamp())
  );
end;
$$;

grant usage on schema private to authenticated;
revoke all on function private.chat_is_muted(uuid,text) from public, anon;
revoke all on function private.chat_can_access(text) from public, anon;
grant execute on function private.chat_is_muted(uuid,text) to authenticated;
grant execute on function private.chat_can_access(text) to authenticated;

create policy chat_messages_read on public.chat_messages
  for select to authenticated
  using (private.chat_can_access(room) and (not is_hidden or private.has_role(array['super_admin','admin'])));
create policy chat_messages_send on public.chat_messages
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.chat_can_access(room));
create policy chat_mutes_read on public.chat_mutes
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_role(array['super_admin','admin']));

create or replace function private.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.user_id <> (select auth.uid()) then
    raise exception 'El autor de un mensaje debe ser la sesión actual';
  end if;
  if new.media_path is not null and new.media_path not like (new.user_id::text || '/' || new.room || '/%') then
    raise exception 'El archivo no pertenece a esta sala';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  if exists (
    select 1 from public.chat_messages m
    where m.user_id = new.user_id and m.created_at > statement_timestamp() - interval '700 milliseconds'
  ) then
    raise exception 'Espera un momento antes de enviar otro mensaje';
  end if;
  if (select count(*) from public.chat_messages m where m.user_id = new.user_id and m.created_at > statement_timestamp() - interval '1 minute') >= 30 then
    raise exception 'Alcanzaste el límite de 30 mensajes por minuto';
  end if;
  select coalesce(nullif(cp.display_name,''), nullif(p.full_name,''), 'Trader'),
         case when cp.is_public then cp.avatar_path else null end,
         p.role,
         exists (select 1 from public.enrollments e where e.user_id = p.id and e.status = 'active' and e.starts_at <= statement_timestamp() and (e.expires_at is null or e.expires_at > statement_timestamp()))
    into new.author_name, new.author_avatar_path, new.author_role, new.author_is_vip
    from public.profiles p
    left join public.community_profiles cp on cp.user_id = p.id
   where p.id = new.user_id;
  if not found then raise exception 'No se encontró el perfil del autor'; end if;
  return new;
end;
$$;
revoke all on function private.prepare_chat_message() from public, anon, authenticated;
create trigger prepare_chat_message_before_insert
  before insert on public.chat_messages
  for each row execute function private.prepare_chat_message();

create or replace function private.broadcast_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(to_jsonb(new), 'INSERT', 'chat:' || new.room, true);
  else
    -- Nunca se difunde el contenido original de un mensaje moderado.
    perform realtime.send(jsonb_build_object('id',new.id,'room',new.room,'user_id',new.user_id,'is_hidden',new.is_hidden), 'UPDATE', 'chat:' || new.room, true);
  end if;
  return null;
end;
$$;
revoke all on function private.broadcast_chat_message() from public, anon, authenticated;
create trigger chat_messages_broadcast_after_change
  after insert or update on public.chat_messages
  for each row execute function private.broadcast_chat_message();

create or replace function private.broadcast_chat_enrollment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_active boolean := false;
  v_is_active boolean := false;
  v_user uuid;
begin
  if tg_op <> 'INSERT' then
    v_was_active := old.status = 'active' and (old.expires_at is null or old.expires_at > statement_timestamp()) and old.starts_at <= statement_timestamp();
  end if;
  if tg_op <> 'DELETE' then
    v_is_active := new.status = 'active' and (new.expires_at is null or new.expires_at > statement_timestamp()) and new.starts_at <= statement_timestamp();
    v_user := new.user_id;
  else
    v_user := old.user_id;
  end if;
  if v_was_active is distinct from v_is_active then
    perform realtime.send(jsonb_build_object('user_id',v_user), 'vip_access_changed', 'chat:general', true);
    perform realtime.send(jsonb_build_object('user_id',v_user), 'vip_access_changed', 'chat:vip', true);
  end if;
  return null;
end;
$$;
revoke all on function private.broadcast_chat_enrollment_change() from public, anon, authenticated;
drop trigger if exists broadcast_chat_enrollment_change on public.enrollments;
create trigger broadcast_chat_enrollment_change
  after insert or update of status, expires_at, starts_at or delete on public.enrollments
  for each row execute function private.broadcast_chat_enrollment_change();

drop policy if exists chat_rooms_receive on realtime.messages;
drop policy if exists chat_rooms_send on realtime.messages;
create policy chat_rooms_receive on realtime.messages
  for select to authenticated
  using (
    extension in ('broadcast','presence')
    and realtime.topic() in ('chat:general','chat:vip')
    and private.chat_can_access(split_part(realtime.topic(),':',2))
  );
create policy chat_rooms_send on realtime.messages
  for insert to authenticated
  with check (
    extension in ('broadcast','presence')
    and realtime.topic() in ('chat:general','chat:vip')
    and private.chat_can_access(split_part(realtime.topic(),':',2))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media', 'chat-media', false, 2097152,
  array['image/webp','image/png','image/jpeg','image/gif','audio/webm','audio/ogg','audio/mp4','audio/mpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_media_upload on storage.objects;
drop policy if exists chat_media_read on storage.objects;
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('general','vip')
    and private.chat_can_access((storage.foldername(name))[2])
  );
create policy chat_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[2] in ('general','vip')
    and private.chat_can_access((storage.foldername(name))[2])
  );
create policy chat_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('general','vip')
  );

drop policy if exists chat_public_avatars_read on storage.objects;
create policy chat_public_avatars_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'profile-avatars'
    and private.chat_can_access('general')
    and exists (
      select 1 from public.community_profiles cp
      where cp.avatar_path = objects.name and cp.is_public
    )
  );

create or replace function public.chat_admin_hide_message(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
    raise exception 'Solo administración puede moderar el chat';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'Escribe un motivo de moderación válido';
  end if;
  update public.chat_messages
     set is_hidden = true, hidden_by = (select auth.uid()), hidden_at = statement_timestamp(),
         moderation_reason = btrim(p_reason)
   where id = p_message and not is_hidden;
  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'El mensaje ya no está disponible'; end if;
  insert into public.audit_logs(actor_id, action, target_id, details)
  values ((select auth.uid()), 'chat.message.hidden', p_message, jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.chat_admin_mute_user(p_user uuid, p_room text, p_minutes integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
    raise exception 'Solo administración puede silenciar usuarios';
  end if;
  if p_user is null or p_user = (select auth.uid()) or p_room not in ('general','vip','all') then
    raise exception 'Usuario o sala no válidos';
  end if;
  if exists (select 1 from public.profiles p where p.id = p_user and p.role in ('super_admin','admin')) then
    raise exception 'No se puede silenciar a otro administrador';
  end if;
  if p_minutes not between 5 and 10080 or p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 300 then
    raise exception 'Duración o motivo no válidos';
  end if;
  insert into public.chat_mutes(user_id, room_scope, muted_until, reason, created_by)
  values (p_user, p_room, statement_timestamp() + make_interval(mins => p_minutes), btrim(p_reason), (select auth.uid()))
  on conflict (user_id, room_scope) do update
    set muted_until = excluded.muted_until, reason = excluded.reason, created_by = excluded.created_by, created_at = statement_timestamp();
  insert into public.audit_logs(actor_id, action, target_id, details)
  values ((select auth.uid()), 'chat.user.muted', p_user, jsonb_build_object('room',p_room,'minutes',p_minutes,'reason',btrim(p_reason)));
  if p_room in ('general','all') then
    perform realtime.send(jsonb_build_object('user_id',p_user,'room_scope',p_room), 'mute', 'chat:general', true);
  end if;
  if p_room in ('vip','all') then
    perform realtime.send(jsonb_build_object('user_id',p_user,'room_scope',p_room), 'mute', 'chat:vip', true);
  end if;
end;
$$;

create or replace function public.chat_admin_unmute_user(p_user uuid, p_room text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
    raise exception 'Solo administración puede retirar silencios';
  end if;
  if p_room is null or p_room not in ('general','vip','all') then raise exception 'Sala no válida'; end if;
  delete from public.chat_mutes where user_id = p_user and room_scope = p_room;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    insert into public.audit_logs(actor_id, action, target_id, details)
    values ((select auth.uid()), 'chat.user.unmuted', p_user, jsonb_build_object('room',p_room));
  end if;
end;
$$;

revoke all on function public.chat_admin_hide_message(uuid,text) from public, anon;
revoke all on function public.chat_admin_mute_user(uuid,text,integer,text) from public, anon;
revoke all on function public.chat_admin_unmute_user(uuid,text) from public, anon;
grant execute on function public.chat_admin_hide_message(uuid,text) to authenticated;
grant execute on function public.chat_admin_mute_user(uuid,text,integer,text) to authenticated;
grant execute on function public.chat_admin_unmute_user(uuid,text) to authenticated;

-- Indexes para borrar o auditar mensajes y silencios sin recorrer las tablas.
create index if not exists chat_messages_hidden_by_idx on public.chat_messages(hidden_by);
create index if not exists chat_mutes_created_by_idx on public.chat_mutes(created_by);
-- Fotos, reacciones y comentarios del chat y de los perfiles públicos.

alter table public.community_profiles
  add column if not exists banner_path text,
  add constraint community_profiles_banner_path_valid
    check (banner_path is null or banner_path like (user_id::text || '/banner/%'));

alter table public.chat_messages
  drop constraint if exists chat_messages_message_type_check,
  drop constraint if exists chat_message_payload_valid,
  drop constraint if exists chat_message_duration_valid;

alter table public.chat_messages
  add constraint chat_messages_message_type_check
    check (message_type in ('text','sticker','image','audio')),
  add constraint chat_message_payload_valid check (
    (message_type = 'text' and body is not null and char_length(btrim(body)) between 1 and 2000 and media_path is null)
    or (message_type = 'sticker' and ((media_path is not null and body is null) or (media_path is null and body is not null and char_length(body) between 1 and 24)))
    or (message_type in ('image','audio') and body is null and media_path is not null)
  ),
  add constraint chat_message_duration_valid check (
    (message_type = 'audio' and media_duration_seconds between 1 and 60)
    or (message_type <> 'audio' and media_duration_seconds is null)
  );

update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/webp','image/png','image/jpeg','image/gif','audio/webm','audio/ogg','audio/mp4','audio/mpeg']
 where id = 'chat-media';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media','community-media',false,5242880,array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','🔥','👏','💎','🚀','😂')),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,emoji)
);

alter table public.chat_message_reactions enable row level security;
revoke all on public.chat_message_reactions from public, anon, authenticated;
grant select, insert, delete on public.chat_message_reactions to authenticated;

create policy chat_reactions_read on public.chat_message_reactions
  for select to authenticated
  using (exists (
    select 1 from public.chat_messages m
    where m.id = message_id and not m.is_hidden and private.chat_can_access(m.room)
  ));
create policy chat_reactions_add on public.chat_message_reactions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.chat_messages m
    where m.id = message_id and not m.is_hidden and private.chat_can_access(m.room)
  ));
create policy chat_reactions_remove on public.chat_message_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null,
  caption text not null default '' check (char_length(caption) <= 600),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  constraint community_posts_media_path_valid check (media_path like (user_id::text || '/posts/%'))
);
create index community_posts_user_created_idx on public.community_posts(user_id,created_at desc);
create index community_posts_public_created_idx on public.community_posts(created_at desc) where not is_hidden;

create table public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','🔥','👏','💎','🚀','😂')),
  created_at timestamptz not null default now(),
  primary key (post_id,user_id,emoji)
);
create index community_post_reactions_post_idx on public.community_post_reactions(post_id);

create table public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index community_post_comments_post_created_idx on public.community_post_comments(post_id,created_at asc);

alter table public.community_posts enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_post_comments enable row level security;
revoke all on public.community_posts,public.community_post_reactions,public.community_post_comments from public,anon,authenticated;
grant select,insert,delete on public.community_posts to authenticated;
grant select,insert,delete on public.community_post_reactions to authenticated;
grant select,insert on public.community_post_comments to authenticated;

create policy community_posts_read on public.community_posts
  for select to authenticated
  using (
    (not is_hidden and exists (
      select 1 from public.community_profiles cp
      where cp.user_id = community_posts.user_id and (cp.is_public or cp.user_id = (select auth.uid()))
    )) or private.has_role(array['super_admin','admin'])
  );
create policy community_posts_add on public.community_posts
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.community_profiles cp
      where cp.user_id = (select auth.uid()) and cp.is_public
    )
  );
create policy community_posts_remove on public.community_posts
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_role(array['super_admin','admin']));

create policy community_post_reactions_read on public.community_post_reactions
  for select to authenticated
  using (exists (
    select 1 from public.community_posts p
    join public.community_profiles cp on cp.user_id = p.user_id
    where p.id = post_id and not p.is_hidden and (cp.is_public or cp.user_id = (select auth.uid()))
  ));
create policy community_post_reactions_add on public.community_post_reactions
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.community_posts p
      join public.community_profiles cp on cp.user_id = p.user_id
      where p.id = post_id and not p.is_hidden and cp.is_public
    )
  );
create policy community_post_reactions_remove on public.community_post_reactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy community_post_comments_read on public.community_post_comments
  for select to authenticated
  using (
    (not is_hidden and exists (
      select 1 from public.community_posts p
      join public.community_profiles cp on cp.user_id = p.user_id
      where p.id = post_id and not p.is_hidden and (cp.is_public or cp.user_id = (select auth.uid()))
    )) or private.has_role(array['super_admin','admin'])
  );
create policy community_post_comments_add on public.community_post_comments
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.community_posts p
      join public.community_profiles cp on cp.user_id = p.user_id
      where p.id = post_id and not p.is_hidden and cp.is_public
    )
  );

-- Los perfiles y sus fotos solo se leen si son públicos o pertenecen a la sesión actual.
drop policy if exists community_media_upload on storage.objects;
drop policy if exists community_media_read on storage.objects;
drop policy if exists community_media_delete on storage.objects;
create policy community_media_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] in ('banner','posts')
  );
create policy community_media_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.community_profiles cp
        where cp.user_id::text = (storage.foldername(name))[1]
          and cp.is_public
      )
      or private.has_role(array['super_admin','admin'])
    )
  );
create policy community_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.community_profile_vip_status(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para consultar perfiles';
  end if;
  if p_user <> (select auth.uid())
     and not private.has_role(array['super_admin','admin'])
     and not exists (select 1 from public.community_profiles cp where cp.user_id = p_user and cp.is_public) then
    raise exception 'Perfil no disponible';
  end if;
  return exists (
    select 1 from public.enrollments e
    where e.user_id = p_user and e.status = 'active'
      and e.starts_at <= statement_timestamp()
      and (e.expires_at is null or e.expires_at > statement_timestamp())
  );
end;
$$;
revoke all on function public.community_profile_vip_status(uuid) from public,anon;
grant execute on function public.community_profile_vip_status(uuid) to authenticated;

create or replace function public.community_admin_hide_post(p_post uuid,p_hidden boolean,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
    raise exception 'Solo administración puede moderar publicaciones';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 300 then
    raise exception 'Escribe un motivo de moderación válido';
  end if;
  update public.community_posts set is_hidden = p_hidden where id = p_post;
  if not found then raise exception 'Publicación no encontrada'; end if;
  insert into public.audit_logs(actor_id,action,target_id,details)
  values ((select auth.uid()),'community.post.moderated',p_post,jsonb_build_object('hidden',p_hidden,'reason',btrim(p_reason)));
end;
$$;
revoke all on function public.community_admin_hide_post(uuid,boolean,text) from public,anon;
grant execute on function public.community_admin_hide_post(uuid,boolean,text) to authenticated;

create or replace function public.community_admin_hide_comment(p_comment uuid,p_hidden boolean,p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
    raise exception 'Solo administración puede moderar comentarios';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 300 then
    raise exception 'Escribe un motivo de moderación válido';
  end if;
  update public.community_post_comments set is_hidden = p_hidden where id = p_comment;
  if not found then raise exception 'Comentario no encontrado'; end if;
  insert into public.audit_logs(actor_id,action,target_id,details)
  values ((select auth.uid()),'community.comment.moderated',p_comment,jsonb_build_object('hidden',p_hidden,'reason',btrim(p_reason)));
end;
$$;
revoke all on function public.community_admin_hide_comment(uuid,boolean,text) from public,anon;
grant execute on function public.community_admin_hide_comment(uuid,boolean,text) to authenticated;

grant delete on public.community_post_comments to authenticated;
create policy community_post_comments_remove on public.community_post_comments
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.has_role(array['super_admin','admin']));

create or replace function private.broadcast_chat_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message uuid;
  v_user uuid;
  v_emoji text;
  v_room text;
  v_added boolean;
begin
  if tg_op = 'INSERT' then
    v_message := new.message_id; v_user := new.user_id; v_emoji := new.emoji; v_added := true;
  else
    v_message := old.message_id; v_user := old.user_id; v_emoji := old.emoji; v_added := false;
  end if;
  select room into v_room from public.chat_messages where id = v_message;
  if v_room is not null then
    perform realtime.send(jsonb_build_object('message_id',v_message,'user_id',v_user,'emoji',v_emoji,'added',v_added), 'reaction', 'chat:' || v_room, true);
  end if;
  return null;
end;
$$;
revoke all on function private.broadcast_chat_reaction() from public,anon,authenticated;
create trigger chat_message_reaction_broadcast
  after insert or delete on public.chat_message_reactions
  for each row execute function private.broadcast_chat_reaction();

create or replace function private.broadcast_community_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post uuid;
  v_user uuid;
  v_emoji text;
  v_event text;
  v_added boolean;
begin
  if tg_table_name = 'community_post_reactions' then
    if tg_op = 'INSERT' then
      v_post := new.post_id; v_user := new.user_id; v_emoji := new.emoji; v_added := true;
    else
      v_post := old.post_id; v_user := old.user_id; v_emoji := old.emoji; v_added := false;
    end if;
    v_event := 'reaction';
    perform realtime.send(jsonb_build_object('post_id',v_post,'user_id',v_user,'emoji',v_emoji,'added',v_added), v_event, 'community:profile:' || (select user_id::text from public.community_posts where id=v_post), true);
  else
    if tg_op = 'INSERT' then v_post := new.post_id; else v_post := old.post_id; end if;
    v_event := 'comment';
    perform realtime.send(jsonb_build_object('post_id',v_post), v_event, 'community:profile:' || (select user_id::text from public.community_posts where id=v_post), true);
  end if;
  return null;
end;
$$;
revoke all on function private.broadcast_community_post_activity() from public,anon,authenticated;
create trigger community_post_reaction_broadcast
  after insert or delete on public.community_post_reactions
  for each row execute function private.broadcast_community_post_activity();
create trigger community_post_comment_broadcast
  after insert or delete on public.community_post_comments
  for each row execute function private.broadcast_community_post_activity();

drop policy if exists community_profile_realtime_read on realtime.messages;
create policy community_profile_realtime_read on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() like 'community:profile:%'
    and exists (
      select 1 from public.community_profiles cp
      where cp.user_id::text = split_part(realtime.topic(),':',3)
        and (cp.is_public or cp.user_id = (select auth.uid()) or private.has_role(array['super_admin','admin']))
    )
  );
-- Índices de soporte para las claves foráneas de actividad social.
create index if not exists chat_message_reactions_user_created_idx
  on public.chat_message_reactions(user_id,created_at desc);
create index if not exists community_post_reactions_user_idx
  on public.community_post_reactions(user_id);
create index if not exists community_post_comments_user_created_idx
  on public.community_post_comments(user_id,created_at desc);
