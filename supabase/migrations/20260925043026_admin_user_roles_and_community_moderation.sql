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
