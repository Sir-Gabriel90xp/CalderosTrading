-- Índices de soporte para las claves foráneas de actividad social.
create index if not exists chat_message_reactions_user_created_idx
  on public.chat_message_reactions(user_id,created_at desc);
create index if not exists community_post_reactions_user_idx
  on public.community_post_reactions(user_id);
create index if not exists community_post_comments_user_created_idx
  on public.community_post_comments(user_id,created_at desc);
