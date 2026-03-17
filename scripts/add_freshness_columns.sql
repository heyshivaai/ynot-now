-- ═══════════════════════════════════════════════════════════════════════════
-- FRESHNESS VALIDATION MIGRATION
-- Adds columns to track source date freshness for findings
-- Run this once to add the new columns to the findings table
-- ═══════════════════════════════════════════════════════════════════════════

-- Add source publication date column
ALTER TABLE findings ADD COLUMN IF NOT EXISTS source_published_date date;

-- Add freshness flag: 'fresh' (< 7 days), 'undated' (no date), 'stale' (> 7 days)
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_flag text DEFAULT 'undated';

-- Add freshness priority: 1 = fresh (prioritized), 2 = undated, 3 = stale (deprioritized)
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_priority int DEFAULT 2;

-- Add index for faster sorting by freshness
CREATE INDEX IF NOT EXISTS idx_findings_freshness ON findings(freshness_priority, confidence DESC);

-- Add index for date filtering
CREATE INDEX IF NOT EXISTS idx_findings_source_date ON findings(source_published_date DESC);

-- Flag all historical findings for review (created before today)
UPDATE findings 
SET freshness_flag = 'needs_review', 
    freshness_priority = 2
WHERE source_published_date IS NULL 
  AND created_at < CURRENT_DATE;

COMMENT ON COLUMN findings.source_published_date IS 'Publication date of the newest source reference';
COMMENT ON COLUMN findings.freshness_flag IS 'Source freshness: fresh (< 7 days), undated (no date), stale (> 7 days), needs_review (historical)';
COMMENT ON COLUMN findings.freshness_priority IS 'Priority for sorting: 1=fresh, 2=undated, 3=stale';
