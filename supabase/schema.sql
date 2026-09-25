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
