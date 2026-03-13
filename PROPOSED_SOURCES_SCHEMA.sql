-- Run once in Supabase SQL Editor before the next cron run
-- This table surfaces domains that consistently produce SIGNAL findings,
-- enabling the auto-promotion feedback loop in cron.js proposeNewSources().

CREATE TABLE IF NOT EXISTS proposed_sources (
  id                bigserial PRIMARY KEY,
  domain            text        NOT NULL UNIQUE,
  hit_count         int         NOT NULL DEFAULT 1,
  first_seen        date        NOT NULL DEFAULT CURRENT_DATE,
  suggested_for     text,           -- which mind domain surfaced it
  status            text        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposed_sources_status_idx ON proposed_sources (status);
CREATE INDEX IF NOT EXISTS proposed_sources_domain_idx ON proposed_sources (domain);

-- Fix source_reputation to support proper upsert (PostgREST merge-duplicates requires UNIQUE).
-- Wrapped in DO block so it's safe to re-run if constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'source_reputation_domain_unique'
  ) THEN
    ALTER TABLE source_reputation ADD CONSTRAINT source_reputation_domain_unique UNIQUE (domain);
  END IF;
END$$;
