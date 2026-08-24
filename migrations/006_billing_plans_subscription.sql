-- Migration 006: Billing — planos Monitor e Radar
-- Padrão TestDiff/EstilOS. Trial 7 dias com limites Radar.

-- Planos disponíveis
create table if not exists plan (
  id          uuid primary key default gen_random_uuid(),
  slug        varchar(32) not null unique,
  name        varchar(64) not null,
  description text,
  price_cents integer not null default 0,
  stripe_price_id text,
  max_monthly_analyses integer not null default 50,
  created_at  timestamptz not null default now()
);

-- Seed dos planos
insert into plan (slug, name, description, price_cents, max_monthly_analyses)
values
  ('monitor', 'Monitor', 'Monitoramento essencial de performance — 50 análises/mês', 7900, 50),
  ('radar',   'Radar',   'Visão completa de performance — 250 análises/mês',         14900, 250)
on conflict (slug) do update
  set price_cents = excluded.price_cents,
      max_monthly_analyses = excluded.max_monthly_analyses;

-- Subscription por usuário (não por workspace — simplificação para perf-dash)
create table if not exists subscription (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 text not null references "user"(id) on delete cascade,
  plan_id                 uuid not null references plan(id),
  status                  varchar(24) not null default 'trialing'
                            check (status in ('trialing','active','past_due','canceled','unpaid')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_start    timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  cancel_at               timestamptz,
  canceled_at             timestamptz,
  pending_downgrade_plan  varchar(32),
  pending_downgrade_date  timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists sub_user_active_uidx on subscription(user_id)
  where status in ('trialing','active','past_due');

-- Registro de uso por processamento (conta no processamento, não no salvamento)
create table if not exists analysis_usage (
  id           serial primary key,
  user_id      text not null references "user"(id) on delete cascade,
  plan_slug    varchar(32) not null,
  processed_at timestamptz not null default now()
);

create index if not exists idx_analysis_usage_user_month
  on analysis_usage(user_id, processed_at);

-- NFS-e por invoice
create table if not exists nfse_emission (
  id                  serial primary key,
  stripe_invoice_id   text not null unique,
  user_id             text not null references "user"(id) on delete cascade,
  nfse_numero         text,
  codigo_verificacao  text,
  verificacao_url     text,
  status              varchar(20) not null default 'pending'
                        check (status in ('pending','emitted','canceled','error')),
  error_message       text,
  email_sent_at       timestamptz,
  email_recipient     text,
  email_error         text,
  xml_content         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Notificações da plataforma
create table if not exists notification (
  id          serial primary key,
  user_id     text references "user"(id) on delete cascade,
  target_plan varchar(32),
  target_status varchar(24),
  title       text not null,
  body        text not null,
  type        varchar(16) not null default 'info'
                check (type in ('info','warning','success')),
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists notification_read (
  id              serial primary key,
  notification_id int not null references notification(id) on delete cascade,
  user_id         text not null references "user"(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique(notification_id, user_id)
);
