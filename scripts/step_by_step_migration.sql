-- ═══════════════════════════════════════════════════════════════════════════
-- STEP-BY-STEP GUIDE: OPTION B - FULL MIGRATION
-- Copy each section below and run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add freshness validation columns
-- ────────────────────────────────────────────────────────────────────────────

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

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: Verify columns were created
-- ────────────────────────────────────────────────────────────────────────────

SELECT 
  column_name, 
  data_type, 
  column_default 
FROM information_schema.columns 
WHERE table_name = 'findings' 
  AND column_name IN ('source_published_date', 'freshness_flag', 'freshness_priority');

-- Expected output: 3 rows showing the new columns

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: Verify indexes were created
-- ────────────────────────────────────────────────────────────────────────────

SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'findings' 
  AND indexname LIKE '%freshness%';

-- Expected output: 2 rows showing idx_findings_freshness and idx_findings_source_date

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: Flag all historical findings for review
-- ────────────────────────────────────────────────────────────────────────────

UPDATE findings 
SET freshness_flag = 'needs_review', 
    freshness_priority = 3  -- Lower priority (3 = deprioritized)
WHERE source_published_date IS NULL 
  AND created_at < CURRENT_DATE;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: Verify the update worked
-- ────────────────────────────────────────────────────────────────────────────

SELECT 
  freshness_flag, 
  COUNT(*) as count
FROM findings
GROUP BY freshness_flag
ORDER BY count DESC;

-- Expected output: Most findings should now be 'needs_review'

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: Check which findings are now flagged (including NBC article)
-- ────────────────────────────────────────────────────────────────────────────

SELECT 
  run_date,
  mind_name,
  title,
  freshness_flag,
  freshness_priority
FROM findings
WHERE title ILIKE '%claude%' OR title ILIKE '%anthropic%'
ORDER BY run_date DESC
LIMIT 10;

-- You should see the NBC Claude 4 finding flagged as 'needs_review'

-- ────────────────────────────────────────────────────────────────────────────
-- ✅ MIGRATION COMPLETE!
-- ────────────────────────────────────────────────────────────────────────────

-- Next step: Update your API/frontend to filter out 'needs_review' findings
-- Or wait for the next cron run which will create fresh findings only
