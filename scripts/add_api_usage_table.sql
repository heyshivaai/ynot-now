-- API Usage Tracking for Context Hub endpoint
-- Tracks who's consuming YNOT.NOW intelligence: Context Hub CLI, GitHub Actions,
-- programmatic consumers, browsers, etc.
--
-- Run this in Supabase SQL Editor before deploying the updated context-hub.js

CREATE TABLE IF NOT EXISTS api_usage (
  id bigserial PRIMARY KEY,
  endpoint text NOT NULL DEFAULT 'context-hub',
  domain_filter text DEFAULT 'all',
  format text DEFAULT 'markdown',
  consumer_type text DEFAULT 'unknown',  -- context-hub-cli | github-action | cli-tool | programmatic | browser | unknown
  user_agent text,
  referer text,
  findings_served int DEFAULT 0,
  ip_hash text,                          -- partial hash, not full IP — privacy-safe
  created_at timestamptz DEFAULT now()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_consumer ON api_usage(consumer_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_domain ON api_usage(domain_filter, created_at DESC);

-- Useful views for weekly review
-- Total requests per week
CREATE OR REPLACE VIEW api_usage_weekly AS
SELECT
  date_trunc('week', created_at) AS week,
  count(*) AS total_requests,
  count(DISTINCT ip_hash) AS unique_consumers,
  count(*) FILTER (WHERE consumer_type = 'context-hub-cli') AS chub_cli,
  count(*) FILTER (WHERE consumer_type = 'programmatic') AS programmatic,
  count(*) FILTER (WHERE consumer_type = 'github-action') AS github_action,
  count(*) FILTER (WHERE consumer_type = 'browser') AS browser,
  count(*) FILTER (WHERE format = 'json') AS json_requests,
  count(*) FILTER (WHERE format = 'markdown') AS markdown_requests
FROM api_usage
GROUP BY 1
ORDER BY 1 DESC;

-- Most popular domains
CREATE OR REPLACE VIEW api_usage_by_domain AS
SELECT
  domain_filter,
  count(*) AS requests,
  count(DISTINCT ip_hash) AS unique_consumers,
  max(created_at) AS last_accessed
FROM api_usage
GROUP BY 1
ORDER BY 2 DESC;
