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
