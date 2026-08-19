alter table workspace
  add column plan varchar(24) not null default 'starter' check (plan in ('starter', 'pro', 'enterprise')),
  add column subscription_status varchar(24) not null default 'trialing' check (subscription_status in ('trialing', 'active', 'past_due', 'cancelled')),
  add column trial_ends_at timestamptz default (now() + interval '14 days'),
  add column monthly_analysis_limit integer not null default 50,
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_ends_at timestamptz;

create unique index workspace_stripe_customer_uidx on workspace (stripe_customer_id) where stripe_customer_id is not null;
