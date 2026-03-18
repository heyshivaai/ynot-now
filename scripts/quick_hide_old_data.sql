-- ═══════════════════════════════════════════════════════════════════════════
-- QUICK FIX: Hide old findings from frontend
-- This marks all findings before today as archived/hidden
-- Run this in Supabase SQL Editor if you haven't done the full migration yet
-- ═══════════════════════════════════════════════════════════════════════════

-- Option 1: Add a simple 'archived' column if it doesn't exist
ALTER TABLE findings ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

-- Mark all findings before today as archived
UPDATE findings 
SET archived = true 
WHERE run_date < CURRENT_DATE;

-- Now update your frontend/API to filter out archived findings:
-- In your queries, add: WHERE archived = false OR archived IS NULL

-- Verify what will be hidden:
SELECT 
  run_date, 
  COUNT(*) as findings_count,
  STRING_AGG(DISTINCT mind_name, ', ') as agents
FROM findings
WHERE archived = true
GROUP BY run_date
ORDER BY run_date DESC;

-- Verify what remains visible:
SELECT 
  run_date, 
  COUNT(*) as findings_count,
  STRING_AGG(DISTINCT mind_name, ', ') as agents
FROM findings
WHERE archived = false OR archived IS NULL
GROUP BY run_date
ORDER BY run_date DESC;
