create extension if not exists pgcrypto;

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  google_email text not null,
  access_mode text not null check (access_mode in ('mcc', 'direct', 'mixed')),
  refresh_token text not null,
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  currency_code text not null,
  time_zone text not null,
  is_demo boolean not null default false,
  access text not null check (access in ('mcc', 'direct', 'demo')),
  login_customer_id text,
  connection_id uuid references public.connections (id) on delete set null,
  last_audit_at timestamptz,
  last_audit_error text
);

create table public.findings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  fingerprint text not null unique,
  rule_id text not null,
  severity text not null check (severity in ('error', 'warning', 'opportunity')),
  status text not null default 'open' check (status in ('open', 'accepted', 'dismissed', 'done', 'resolved')),
  source text not null check (source in ('rule', 'google_recommendation')),
  title text not null,
  summary text not null,
  suggestion text not null,
  entity_type text not null,
  entity_id text not null,
  entity_name text not null,
  campaign_name text,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null,
  confidence numeric not null,
  confidence_reason text not null,
  impact_estimate text,
  caution text,
  interpretation text,
  interpretation_model text,
  interpretation_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index findings_customer_status_idx on public.findings (customer_id, status);
create index findings_severity_idx on public.findings (severity);

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings (id) on delete cascade,
  action text not null check (action in ('accepted', 'dismissed', 'done', 'reopened')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index decisions_finding_created_idx on public.decisions (finding_id, created_at);

create table public.audit_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null check (status in ('ok', 'error')),
  finding_count integer not null,
  operation_count integer not null,
  message text
);

create index audit_runs_customer_finished_idx on public.audit_runs (customer_id, finished_at desc);

alter table public.connections enable row level security;
alter table public.customers enable row level security;
alter table public.findings enable row level security;
alter table public.decisions enable row level security;
alter table public.audit_runs enable row level security;

revoke all on public.connections from anon, authenticated;
revoke all on public.customers from anon, authenticated;
revoke all on public.findings from anon, authenticated;
revoke all on public.decisions from anon, authenticated;
revoke all on public.audit_runs from anon, authenticated;
