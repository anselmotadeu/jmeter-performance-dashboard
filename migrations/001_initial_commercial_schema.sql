create table "user" (
  "id" text primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" boolean not null,
  "image" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "firstName" text not null,
  "lastName" text not null,
  "phone" text not null
);

create unique index user_email_lower_uidx on "user" (lower("email"));

create table "session" (
  "id" text primary key,
  "expiresAt" timestamptz not null,
  "token" text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" (id) on delete cascade
);

create table "account" (
  "id" text primary key,
  "issuer" text not null,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" (id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null
);

create table "verification" (
  "id" text primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table "rateLimit" ("id" text primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);
create table "loginAttempt" ("key" text primary key, "count" integer not null default 0, "lockedUntil" timestamptz, "updatedAt" timestamptz not null default now());
create table "passwordResetAttempt" ("key" text primary key, "lastSentAt" timestamptz not null default now());
create table "routeRateLimit" ("key" text primary key, "count" integer not null default 0, "windowStartedAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now());

create index session_user_idx on "session" ("userId");
create index account_user_idx on "account" ("userId");
create unique index account_issuer_account_uidx on "account" ("issuer", "accountId");
create index verification_identifier_idx on "verification" ("identifier");

create table workspace (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  slug varchar(140) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspace_member (
  workspace_id uuid not null references workspace (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role varchar(20) not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table project (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspace (id) on delete cascade,
  name varchar(140) not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table analysis_run (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id) on delete cascade,
  created_by text not null references "user" (id) on delete cascade,
  idempotency_key uuid not null,
  payload_hash varchar(64) not null,
  title varchar(180) not null,
  framework varchar(60) not null,
  source_format varchar(60) not null,
  data_quality varchar(16) not null check (data_quality in ('certified', 'beta')),
  status varchar(20) not null default 'completed' check (status in ('processing', 'completed', 'failed')),
  original_file_name varchar(255),
  file_size bigint not null default 0 check (file_size >= 0),
  file_sha256 varchar(64),
  schema_version integer not null default 2,
  capabilities jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '[]'::jsonb,
  success_count bigint not null default 0,
  error_count bigint not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms bigint not null default 0,
  max_users integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, idempotency_key)
);

create table analysis_label (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references analysis_run (id) on delete cascade,
  label varchar(300) not null,
  request_count bigint not null,
  average numeric(14,3) not null,
  median numeric(14,3) not null,
  p90 numeric(14,3) not null,
  p95 numeric(14,3) not null,
  min numeric(14,3) not null,
  max numeric(14,3) not null,
  error_rate numeric(6,3) not null,
  throughput numeric(14,3) not null,
  average_latency numeric(14,3),
  p95_latency numeric(14,3),
  average_bytes numeric(18,3),
  average_sent_bytes numeric(18,3),
  unique (run_id, label)
);

create table analysis_time_bucket (
  run_id uuid not null references analysis_run (id) on delete cascade,
  bucket_at timestamptz not null,
  label varchar(300) not null,
  request_count integer not null,
  error_count integer not null,
  success_count integer not null,
  average_elapsed numeric(14,3),
  average_latency numeric(14,3),
  active_users integer,
  bytes_received bigint,
  bytes_sent bigint,
  primary key (run_id, bucket_at, label)
);

create table analysis_error (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references analysis_run (id) on delete cascade,
  code varchar(80) not null,
  message varchar(500) not null,
  occurrence_count bigint not null,
  unique (run_id, code, message)
);

create table analysis_check (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references analysis_run (id) on delete cascade,
  name varchar(300) not null,
  passes bigint not null,
  fails bigint not null
);

create table analysis_threshold (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references analysis_run (id) on delete cascade,
  metric varchar(160) not null,
  expression varchar(300) not null,
  passed boolean not null
);

create table baseline (
  project_id uuid primary key references project (id) on delete cascade,
  run_id uuid not null references analysis_run (id) on delete cascade,
  updated_by text not null references "user" (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table comparison (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references project (id) on delete cascade,
  baseline_run_id uuid not null references analysis_run (id) on delete cascade,
  candidate_run_id uuid not null references analysis_run (id) on delete cascade,
  created_by text not null references "user" (id) on delete cascade,
  verdict varchar(20) not null check (verdict in ('improved', 'stable', 'regressed')),
  issue_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (baseline_run_id, candidate_run_id)
);

create table usage_event (
  id bigserial primary key,
  workspace_id uuid not null references workspace (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  event_type varchar(60) not null,
  quantity bigint not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_member_user_idx on workspace_member (user_id);
create index project_workspace_idx on project (workspace_id, updated_at desc);
create index analysis_run_project_created_idx on analysis_run (project_id, created_at desc);
create index analysis_run_creator_created_idx on analysis_run (created_by, created_at desc);
create index analysis_label_run_idx on analysis_label (run_id);
create index analysis_time_bucket_run_idx on analysis_time_bucket (run_id, bucket_at);
create index analysis_error_run_idx on analysis_error (run_id);
create index comparison_project_created_idx on comparison (project_id, created_at desc);
create index usage_workspace_created_idx on usage_event (workspace_id, created_at desc);
