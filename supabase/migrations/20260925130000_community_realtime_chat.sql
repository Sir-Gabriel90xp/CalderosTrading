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
