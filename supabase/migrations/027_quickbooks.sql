-- QuickBooks Online integration
-- Run this in the Supabase SQL editor.

-- 1. QB app credentials (one row per org — mirrors docusign_credentials pattern)
create table if not exists quickbooks_credentials (
  id          integer primary key default 1,
  client_id   text not null,
  client_secret text not null,
  environment text not null default 'sandbox'
    check (environment in ('sandbox', 'production'))
);

-- 2. QB customer ID on clients
alter table clients
  add column if not exists qb_customer_id text;

-- 3. QB fields on invoices
alter table invoices
  add column if not exists qb_invoice_id    text,
  add column if not exists qb_sync_status   text,   -- 'synced' | 'error' | null
  add column if not exists qb_last_synced_at timestamptz,
  add column if not exists qb_payment_link  text;

-- 4. Payment schedule rules — configures when invoices should be suggested
create table if not exists payment_schedule_rules (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid references company_profiles(id) on delete cascade,
  rule_name            text not null,
  rule_type            text not null default 'custom'
    check (rule_type in ('deposit', 'milestone', 'final', 'custom')),
  trigger_event        text not null default 'manual'
    check (trigger_event in ('project_created', 'percent_complete', 'project_completed', 'manual')),
  trigger_value        jsonb,                    -- e.g. {"percent": 50}
  invoice_amount_type  text not null default 'percent_of_contract'
    check (invoice_amount_type in ('fixed', 'percent_of_contract', 'remaining_balance')),
  invoice_amount_value numeric(15,4),            -- % (0-100) for percent type, dollars for fixed
  payment_terms_days   integer not null default 14,
  send_via_qb          boolean not null default true,
  description_template text,                    -- e.g. "30% deposit for {{project_name}}"
  sort_order           integer not null default 0,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- Seed sensible defaults (company_id = null means "apply to all companies")
insert into payment_schedule_rules
  (rule_name, rule_type, trigger_event, invoice_amount_type, invoice_amount_value, payment_terms_days, send_via_qb, description_template, sort_order)
values
  ('Contract Deposit',   'deposit',   'project_created',    'percent_of_contract', 30, 7,  true, '30% contract deposit for {{project_name}}', 1),
  ('Midpoint Draw',      'milestone', 'percent_complete',   'percent_of_contract', 40, 14, true, '40% progress payment for {{project_name}}', 2),
  ('Final Payment',      'final',     'project_completed',  'remaining_balance',   null, 14, true, 'Final payment for {{project_name}}',       3)
on conflict do nothing;
