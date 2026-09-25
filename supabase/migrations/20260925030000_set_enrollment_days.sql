-- Permite a administradores fijar los días que quedan en una matrícula desde hoy.
-- La modificación se hace mediante RPC para mantener la autorización en la base de datos.
create or replace function public.admin_set_enrollment_days(p_enrollment uuid,p_days integer) returns void
language plpgsql security definer set search_path='' as $$
declare
 v_enrollment public.enrollments%rowtype;
 v_now timestamptz := now();
begin
 if (select auth.uid()) is null or not private.has_role(array['super_admin','admin']) then
  raise exception 'Sin autorización';
 end if;
 if p_days is null or p_days<1 or p_days>3650 then
  raise exception 'Duración inválida';
 end if;
 select * into v_enrollment from public.enrollments where id=p_enrollment for update;
 if not found then raise exception 'Matrícula no encontrada'; end if;
 update public.enrollments set
  starts_at=case when v_enrollment.status<>'active' or v_enrollment.expires_at<=v_now then v_now else starts_at end,
  expires_at=v_now+make_interval(days=>p_days),
  access_code=case when v_enrollment.status<>'active' or v_enrollment.expires_at<=v_now then upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) else access_code end,
  status='active'
 where id=p_enrollment;
 insert into public.audit_logs(actor_id,action,target_id,details)
 values((select auth.uid()),'set_enrollment_days',v_enrollment.user_id,
  jsonb_build_object('enrollment_id',p_enrollment,'course_id',v_enrollment.course_id,'days',p_days));
end;
$$;
revoke all on function public.admin_set_enrollment_days(uuid,integer) from public,anon;
grant execute on function public.admin_set_enrollment_days(uuid,integer) to authenticated;
