-- ═══════════════════════════════════════════════════════════════════════════
-- LEGAL SAFETY AUDIT: Find Risky Content in Findings
-- Identifies findings with potentially defamatory or accusatory language
-- ═══════════════════════════════════════════════════════════════════════════

-- ── HIGH RISK: Accusatory Language ─────────────────────────────────────────
-- Findings that could lead to legal liability

SELECT 
  id,
  run_date,
  mind_name,
  title,
  verdict,
  confidence,
  'HIGH RISK - Accusatory' as risk_level
FROM findings
WHERE 
  title ILIKE '%suspicious%' OR
  title ILIKE '%dubious%' OR
  title ILIKE '%exposed%' OR
  title ILIKE '%revealed%' OR
  title ILIKE '%fabricated%' OR
  title ILIKE '%fake%' OR
  title ILIKE '%coordinated%' OR
  title ILIKE '%collusion%' OR
  title ILIKE '%misleading%' OR
  title ILIKE '%deceptive%' OR
  title ILIKE '%dishonest%' OR
  title ILIKE '%hiding%' OR
  title ILIKE '%refusing%' OR
  title ILIKE '%washing%' OR
  body ILIKE '%suspicious pattern%' OR
  body ILIKE '%coordinated marketing%' OR
  body ILIKE '%rather than measured%' OR
  body ILIKE '%suggests fraud%' OR
  body ILIKE '%caught%' OR
  body ILIKE '%refuses to%'
ORDER BY run_date DESC, confidence DESC
LIMIT 50;

-- ── MEDIUM RISK: Judgmental Language ──────────────────────────────────────
-- Findings with subjective judgments that should be reframed

SELECT 
  id,
  run_date,
  mind_name,
  title,
  verdict,
  'MEDIUM RISK - Judgmental' as risk_level
FROM findings
WHERE 
  title ILIKE '%hype%' OR
  title ILIKE '%questionable%' OR
  title ILIKE '%alleged%' OR
  title ILIKE '%claims lack%' OR
  title ILIKE '%failed to%' OR
  title ILIKE '%quietly%' OR
  title ILIKE '%scrubbed%' OR
  body ILIKE '%in reality%' OR
  body ILIKE '%the truth is%' OR
  body ILIKE '%despite claims%' OR
  body ILIKE '%contrary to%'
ORDER BY run_date DESC
LIMIT 50;

-- ── STATISTICS: Risk Distribution ──────────────────────────────────────────

SELECT 
  'HIGH RISK' as category,
  COUNT(*) as count
FROM findings
WHERE 
  title ILIKE '%suspicious%' OR title ILIKE '%coordinated%' OR 
  title ILIKE '%fabricated%' OR title ILIKE '%exposed%' OR
  body ILIKE '%suspicious pattern%' OR body ILIKE '%coordinated marketing%'
  
UNION ALL

SELECT 
  'MEDIUM RISK' as category,
  COUNT(*) as count
FROM findings
WHERE 
  title ILIKE '%hype%' OR title ILIKE '%questionable%' OR 
  title ILIKE '%quietly%' OR title ILIKE '%failed to%'
  
UNION ALL

SELECT 
  'TOTAL FINDINGS' as category,
  COUNT(*) as count
FROM findings;

-- ── SPECIFIC PATTERN: "Suggests [negative]" ────────────────────────────────
-- This construction is particularly risky

SELECT 
  id,
  title,
  body,
  run_date
FROM findings
WHERE 
  title ILIKE '%suggests%' OR
  body ILIKE '%suggests%'
ORDER BY run_date DESC
LIMIT 20;

-- ── VENDOR-SPECIFIC RISKS ───────────────────────────────────────────────────
-- Findings that name companies with critical claims

SELECT 
  id,
  title,
  body,
  verdict,
  confidence,
  run_date
FROM findings
WHERE 
  verdict = 'UNVERIFIED' AND
  (body ILIKE '%company%' OR body ILIKE '%vendor%' OR body ILIKE '%carrier%')
  AND confidence <= 2
ORDER BY run_date DESC
LIMIT 30;

-- ── RECOMMENDED ACTIONS ─────────────────────────────────────────────────────
-- For each HIGH RISK finding:
--   1. Review title and body
--   2. Reframe using safe language
--   3. Remove accusatory words
--   4. State facts, not judgments
--   5. Update finding in database
--
-- For MEDIUM RISK findings:
--   1. Review for tone
--   2. Consider reframing if still visible
--   3. Monitor for patterns
--
-- Example safe reframing:
--   BEFORE: "Suspicious Pattern Suggests Coordinated Marketing"
--   AFTER: "Multiple Vendors Report Similar Metrics; Independent Validation Not Published"
