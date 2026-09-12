-- Paste into Supabase → SQL Editor → Run.
-- Multiple compressed proof images on expenses and income.

alter table public.business_expenses
  add column if not exists proofs jsonb not null default '[]'::jsonb;

alter table public.business_incomes
  add column if not exists proofs jsonb not null default '[]'::jsonb;
