-- Reparación aplicada al proyecto de producción el 2026-09-25.
-- Idempotente: conserva matrículas y vencimientos existentes.
alter table public.enrollments add column if not exists access_code text;
alter table public.enrollments alter column access_code set default upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
update public.enrollments set access_code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))
where access_code is null or btrim(access_code)='';
alter table public.enrollments alter column access_code set not null;
create unique index if not exists enrollments_access_code_key on public.enrollments(access_code);

-- Una concesión siempre tiene vencimiento finito. Un código suspendido se rota al reactivar.
create or replace function public.admin_grant_access(p_user uuid,p_course uuid,p_days integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then raise exception 'Sin autorización'; end if;
 if p_days<1 or p_days>3650 then raise exception 'Duración inválida'; end if;
 insert into public.enrollments(user_id,course_id,starts_at,expires_at,status)
 values(p_user,p_course,now(),now()+make_interval(days=>p_days),'active')
 on conflict(user_id,course_id) do update set
   starts_at=case when public.enrollments.status<>'active' or public.enrollments.expires_at<=now() then now() else public.enrollments.starts_at end,
   expires_at=greatest(coalesce(public.enrollments.expires_at,now()),now())+make_interval(days=>p_days),
   access_code=case when public.enrollments.status='suspended' then upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) else public.enrollments.access_code end,
   status='active';
 insert into public.audit_logs(actor_id,action,target_id,details)
 values((select auth.uid()),'grant_access',p_user,jsonb_build_object('course_id',p_course,'days',p_days));
end;
$$;
revoke all on function public.admin_grant_access(uuid,uuid,integer) from public,anon;
grant execute on function public.admin_grant_access(uuid,uuid,integer) to authenticated;

create or replace function public.admin_revoke_access(p_enrollment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then raise exception 'Sin autorización'; end if;
 update public.enrollments set status='suspended',expires_at=now()
 where id=p_enrollment returning user_id into v_user;
 if v_user is null then raise exception 'Matrícula no encontrada'; end if;
 insert into public.audit_logs(actor_id,action,target_id,details)
 values((select auth.uid()),'revoke_access',v_user,jsonb_build_object('enrollment_id',p_enrollment));
end;
$$;
revoke all on function public.admin_revoke_access(uuid) from public,anon;
grant execute on function public.admin_revoke_access(uuid) to authenticated;

-- Aprobar transferencias y capturar pagos concede 90 días adicionales,
-- incluso si la matrícula anterior no tenía vencimiento.
create or replace function public.admin_review_transfer(p_id uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare t public.bank_transfers%rowtype;
begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then raise exception 'Sin autorización'; end if;
 select * into t from public.bank_transfers where id=p_id for update;
 if t.id is null or t.status<>'pending' then raise exception 'Transferencia no pendiente'; end if;
 update public.bank_transfers set status=case when p_approve then 'approved' else 'rejected' end,reviewed_at=now() where id=p_id;
 if p_approve then
  insert into public.enrollments(user_id,course_id,starts_at,expires_at,status)
  values(t.user_id,t.course_id,now(),now()+interval '90 days','active')
  on conflict(user_id,course_id) do update set
   starts_at=case when public.enrollments.status<>'active' or public.enrollments.expires_at<=now() then now() else public.enrollments.starts_at end,
   expires_at=greatest(coalesce(public.enrollments.expires_at,now()),now())+interval '90 days',
   access_code=case when public.enrollments.status='suspended' then upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) else public.enrollments.access_code end,
   status='active';
 end if;
 insert into public.audit_logs(actor_id,action,target_id)
 values((select auth.uid()),case when p_approve then 'approve_transfer' else 'reject_transfer' end,p_id);
end;
$$;
revoke all on function public.admin_review_transfer(uuid,boolean) from public,anon;
grant execute on function public.admin_review_transfer(uuid,boolean) to authenticated;

create or replace function public.finalize_paypal_payment(p_order_id text,p_capture_id text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payments%rowtype;
begin
 select * into p from public.payments where provider='paypal' and provider_order_id=p_order_id for update;
 if p.id is null then raise exception 'Orden no registrada'; end if;
 if p.status='completed' then return; end if;
 if p.status<>'pending' or p_capture_id='' then raise exception 'Estado no válido'; end if;
 update public.payments set status='completed' where id=p.id;
 insert into public.enrollments(user_id,course_id,starts_at,expires_at,status)
 values(p.user_id,p.course_id,now(),now()+interval '90 days','active')
 on conflict(user_id,course_id) do update set
   starts_at=case when public.enrollments.status<>'active' or public.enrollments.expires_at<=now() then now() else public.enrollments.starts_at end,
   expires_at=greatest(coalesce(public.enrollments.expires_at,now()),now())+interval '90 days',
   access_code=case when public.enrollments.status='suspended' then upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) else public.enrollments.access_code end,
   status='active';
 insert into public.audit_logs(actor_id,action,target_id,details)
 values(null,'paypal_capture',p.id,jsonb_build_object('capture_id',p_capture_id));
end;
$$;
revoke all on function public.finalize_paypal_payment(text,text) from public,anon,authenticated;
grant execute on function public.finalize_paypal_payment(text,text) to service_role;
