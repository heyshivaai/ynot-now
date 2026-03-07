-- Run once in Supabase SQL Editor before the next cron run

create table if not exists weekly_posts (
  id            bigserial primary key,
  run_id        text        not null,
  run_date      date        not null,
  post_text     text        not null,
  status        text        not null default 'ready',
  created_at    timestamptz not null default now()
);

create index if not exists weekly_posts_run_date_idx on weekly_posts (run_date desc);
