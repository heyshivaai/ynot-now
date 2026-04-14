-- scripts/add_pipeline_runs_table.sql
-- Heartbeat + idempotency table for the weekly pipeline.
-- One row per week (Monday UTC). Updated by cron.js, cron-synthesise.js, cron-audio.js.
-- Read by api/health.js.

CREATE TABLE IF NOT EXISTS pipeline_runs (
  week              date PRIMARY KEY,             -- Monday of the week, UTC
  phase1_run_id     text,
  phase1_at         timestamptz,
  phase1_findings   integer,
  phase1_ok         boolean DEFAULT false,

  phase2_run_id     text,
  phase2_at         timestamptz,
  phase2_findings   integer,
  phase2_ok         boolean DEFAULT false,

  phase3_at         timestamptz,
  phase3_has_audio  boolean,
  phase3_ok         boolean DEFAULT false,

  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_runs_updated_at_idx
  ON pipeline_runs (updated_at DESC);
