alter table analysis_label
  alter column median drop not null,
  alter column p90 drop not null,
  alter column p95 drop not null,
  alter column min drop not null,
  alter column max drop not null;
