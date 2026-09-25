-- Indexes para borrar o auditar mensajes y silencios sin recorrer las tablas.
create index if not exists chat_messages_hidden_by_idx on public.chat_messages(hidden_by);
create index if not exists chat_mutes_created_by_idx on public.chat_mutes(created_by);
