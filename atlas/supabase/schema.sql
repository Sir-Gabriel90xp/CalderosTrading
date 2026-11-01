-- ATLAS PRO: owner-isolated workspace and normalized daily journal.
create table public.atlas_workspaces (
 user_id uuid primary key references auth.users(id) on delete cascade,
 prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs)='object' and octet_length(prefs::text)<250000),
 revision bigint not null default 0 check (revision>=0),
 updated_at timestamptz not null default now()
);
create table public.atlas_journal (
 user_id uuid not null references public.atlas_workspaces(user_id) on delete cascade,
 id uuid not null,
 date date not null,
 pnl numeric(18,4) not null check (abs(pnl)<=1000000000000),
 note text not null default '' check (length(note)<=300),
 primary key(user_id,id),unique(user_id,date)
);
alter table public.atlas_workspaces enable row level security;
alter table public.atlas_journal enable row level security;
create policy workspace_owner_select on public.atlas_workspaces for select to authenticated using ((select auth.uid())=user_id);
create policy workspace_owner_insert on public.atlas_workspaces for insert to authenticated with check ((select auth.uid())=user_id);
create policy workspace_owner_update on public.atlas_workspaces for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy journal_owner_select on public.atlas_journal for select to authenticated using ((select auth.uid())=user_id);
create policy journal_owner_insert on public.atlas_journal for insert to authenticated with check ((select auth.uid())=user_id);
create policy journal_owner_update on public.atlas_journal for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy journal_owner_delete on public.atlas_journal for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.atlas_workspaces,public.atlas_journal from anon;
grant select,insert,update on public.atlas_workspaces to authenticated;
grant select,insert,update,delete on public.atlas_journal to authenticated;
create function public.atlas_sync(p_prefs jsonb,p_days jsonb,p_expected_revision bigint) returns bigint
language plpgsql security invoker set search_path='' as $$
declare owner_id uuid:=auth.uid(); current_revision bigint;
begin
 if owner_id is null then raise exception 'Authentication required'; end if;
 if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days)>1000 then raise exception 'Invalid journal'; end if;
 if p_prefs->>'version' <> '3' or jsonb_typeof(p_prefs) <> 'object' then raise exception 'Invalid workspace version'; end if;
 insert into public.atlas_workspaces(user_id) values(owner_id) on conflict do nothing;
 select revision into current_revision from public.atlas_workspaces where user_id=owner_id for update;
 if current_revision<>p_expected_revision then raise exception 'ATLAS_CONFLICT'; end if;
 delete from public.atlas_journal where user_id=owner_id;
 insert into public.atlas_journal(user_id,id,date,pnl,note)
 select owner_id,(d->>'id')::uuid,(d->>'date')::date,(d->>'pnl')::numeric,coalesce(d->>'note','') from jsonb_array_elements(p_days) d;
 update public.atlas_workspaces set prefs=p_prefs,revision=current_revision+1,updated_at=now() where user_id=owner_id;
 return current_revision+1;
end; $$;
revoke all on function public.atlas_sync(jsonb,jsonb,bigint) from public,anon;
grant execute on function public.atlas_sync(jsonb,jsonb,bigint) to authenticated;
