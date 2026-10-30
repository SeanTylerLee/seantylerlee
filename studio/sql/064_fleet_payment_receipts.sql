-- Permit Path Supabase. Run once in the SQL editor.
-- Each card payment keeps the Stripe receipt so Studio can show who paid.

alter table public.fleet_payments
  add column if not exists receipt_url text not null default '';

alter table public.fleet_payments
  add column if not exists receipt_number text not null default '';

alter table public.fleet_payments
  add column if not exists payer_email text not null default '';

alter table public.fleet_payments
  add column if not exists paid_through date;
