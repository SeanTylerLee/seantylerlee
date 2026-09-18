-- Paste into Supabase → SQL Editor → Run.
-- Amount on renewals + link when you log one as an expense.

alter table public.renewal_items
  add column if not exists amount numeric(12,2) not null default 0;

alter table public.renewal_items
  add column if not exists logged_expense_id uuid;

comment on column public.renewal_items.amount is 'Expected renewal cost; used when logging into Expenses.';
comment on column public.renewal_items.logged_expense_id is 'business_expenses.id created by Log as expense, if any.';
