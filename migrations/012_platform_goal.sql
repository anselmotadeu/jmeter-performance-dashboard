-- Migration 012: Super Admin — tabela platform_goal
-- Espelha platformGoals do TestDiff/EstilOS (metas da plataforma).
-- Slugs de plano oficiais do JMeter Performance Dashboard: grafico / panorama.

create table if not exists platform_goal (
  id            serial primary key,
  title         varchar(255) not null,
  type          varchar(30) not null,
  -- 'MRR_TARGET' | 'PLAN_COUNT' | 'NEW_CLIENTS' | 'NEW_CONTACTS' | 'CHURN_BELOW'
  target_value  numeric(12,2) not null,
  target_plan   varchar(20),
  -- 'grafico' | 'panorama' | null (qualquer plano)
  period        varchar(20) not null default 'MONTHLY',
  -- 'MONTHLY' | 'WEEKLY' | 'CAMPAIGN' | 'ALLTIME'
  start_date    timestamptz not null,
  end_date      timestamptz,
  notes         text,
  from_simulation boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);