-- Habilita recibos para pagos manuales por PayPal.
-- El importe y la moneda se validan contra el precio publicado del curso mediante RLS.
alter table public.bank_transfers
  add column if not exists currency_code text;
update public.bank_transfers set currency_code='DOP' where currency_code is null;
alter table public.bank_transfers alter column currency_code set default 'DOP';
alter table public.bank_transfers alter column currency_code set not null;
alter table public.bank_transfers
  drop constraint if exists bank_transfers_currency_code_check;
alter table public.bank_transfers
  add constraint bank_transfers_currency_code_check check(currency_code in ('DOP','USD'));

drop policy if exists transfers_insert on public.bank_transfers;
create policy transfers_insert on public.bank_transfers for insert to authenticated
with check(
  user_id=(select auth.uid())
  and status='pending'
  and exists(
    select 1 from public.courses c
    where c.id=bank_transfers.course_id and c.published
      and ((bank_transfers.currency_code='DOP' and c.price=bank_transfers.amount)
        or (bank_transfers.currency_code='USD' and c.paypal_usd_price=bank_transfers.amount))
  )
);

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using(
  private.has_role(array['super_admin','admin'])
  or key in ('bank_name','bank_account','bank_holder','paypal_payment_link')
  or (key='whatsapp_group' and exists(
    select 1 from public.enrollments e
    where e.user_id=(select auth.uid()) and e.status='active'
      and (e.expires_at is null or e.expires_at>now())
  ))
);
