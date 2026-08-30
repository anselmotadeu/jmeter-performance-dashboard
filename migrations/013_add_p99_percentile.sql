alter table analysis_label add column if not exists p99 numeric(14,3);
alter table analysis_label add column if not exists p99_latency numeric(14,3);