-- YNOT.NOW — Table Setup (2026-03-30 Upgrade)
-- Paste this entire block into your Supabase SQL Editor and click "Run"
-- URL: https://supabase.com/dashboard/project/wsplocidlmtfpvzudzdz/sql/new

-- 1. Signal Trajectories — compound signal tracking across weeks
CREATE TABLE IF NOT EXISTS signal_trajectories (
  id bigserial PRIMARY KEY,
  topic_key text UNIQUE NOT NULL,
  title text,
  domain text,
  regions text[] DEFAULT '{Global}',
  current_trl int,
  current_verdict text,
  current_confidence int,
  first_seen date,
  last_seen date,
  appearances int DEFAULT 1,
  cross_agent_count int DEFAULT 1,
  compound_score int DEFAULT 0,
  trl_velocity numeric DEFAULT 0,
  trajectory_data jsonb DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_signal_traj_score ON signal_trajectories(compound_score DESC);
CREATE INDEX IF NOT EXISTS idx_signal_traj_last_seen ON signal_trajectories(last_seen DESC);

-- 2. Raw Intelligence Storage — Tavily results per agent per run
CREATE TABLE IF NOT EXISTS intelligence_raw (
  id bigserial PRIMARY KEY,
  run_id text,
  run_date date,
  mind_id text,
  search_queries text[],
  result_count int,
  results jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- 3. Cross-Agent Agreements — when 2+ agents surface same topic
CREATE TABLE IF NOT EXISTS cross_agent_agreements (
  id bigserial PRIMARY KEY,
  run_date date,
  topic_key text,
  topic_label text,
  agent_count int,
  agents text[],
  finding_titles text[],
  agreement_strength numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 4. Monthly Reviews — cached month-in-review narratives
CREATE TABLE IF NOT EXISTS monthly_reviews (
  id bigserial PRIMARY KEY,
  month_key text UNIQUE,
  month_label text,
  review_text text,
  stats jsonb DEFAULT '{}',
  trajectories jsonb DEFAULT '[]',
  generated_at timestamptz DEFAULT now()
);

-- 5. Add regions column to existing findings table
ALTER TABLE findings ADD COLUMN IF NOT EXISTS regions text[] DEFAULT '{Global}';
