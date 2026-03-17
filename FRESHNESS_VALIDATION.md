# FRESHNESS VALIDATION SYSTEM

**Last Updated:** 2026-03-09  
**Status:** ✅ Active

---

## Overview

YNOT.NOW publishes **weekly briefings of last week's trends**. The freshness validation system ensures that only sources published within the **last 7 days** are included in findings, preventing outdated content from appearing in current briefings.

---

## The Problem

On March 9, 2026, a briefing included a source from **NBC dated May 22, 2025** (10 months old) about Claude 4's launch. This was a critical credibility issue because:
- The briefing claimed to show "last week's trends"
- Old news was presented as current
- No date validation existed in the pipeline

---

## The Solution: 4-Layer Validation

### **Layer 1: Tavily Search (Preventive)**
- **What:** Add `days: 7` parameter to Tavily API calls
- **Where:** `api/cron.js` and `api/cron-synthesise.js` → `tavilySearch()` function
- **Effect:** Tavily only returns results published in the last 7 days
- **Benefit:** Bad sources never enter the system

```javascript
body: JSON.stringify({
  query: query,
  search_depth: 'basic',
  max_results: maxResults || 5,
  days: 7,  // ← Only last 7 days
  include_answer: false
})
```

---

### **Layer 2: Agent Prompts (Instructive)**
- **What:** Explicit date validation instructions in system prompts
- **Where:** `analyseResults()` and synthesis agent prompts
- **Effect:** Claude is instructed to reject old sources
- **Benefit:** AI understands the freshness requirement

```
CRITICAL DATE REQUIREMENT: This is a WEEKLY briefing for LAST WEEK only. 
ONLY use sources published within the last 7 days. 
If you see [published: YYYY-MM-DD], verify it is within the last 7 days. 
Reject any source older than 7 days.
Sources marked [NO DATE] can be used but are lower priority.
```

---

### **Layer 3: Programmatic Validation (Defensive)**
- **What:** JavaScript function that checks each ref's `published_date`
- **Where:** `validateSourceFreshness()` function in both cron files
- **Effect:** Removes stale refs, flags findings, assigns priority
- **Benefit:** Hard enforcement regardless of what Claude returns

**Logic:**
1. Check each ref's `published_date`
2. If date ≥ 7 days old → remove ref, log warning
3. If no date → keep but flag as `undated`
4. If fresh (< 7 days) → flag as `fresh`, priority 1
5. Remove findings with NO fresh refs remaining

**New Fields Added:**
- `source_published_date` (date) - Newest source date
- `freshness_flag` (text) - `fresh` | `undated` | `stale` | `needs_review`
- `freshness_priority` (int) - 1=fresh, 2=undated, 3=stale

---

### **Layer 4: Pulse Generation (Output Prioritization)**
- **What:** Sort findings by freshness_priority before generating briefings
- **Where:** `api/pulse.js` → `generateExecutiveBriefing()` and top findings query
- **Effect:** Fresh findings appear first in briefings
- **Benefit:** User sees the most current content

```javascript
...signals.sort((a, b) => {
  const freshDiff = (a.freshness_priority || 2) - (b.freshness_priority || 2);
  return freshDiff !== 0 ? freshDiff : (b.confidence || 0) - (a.confidence || 0);
})
```

---

## Database Schema Changes

Run this SQL migration on Supabase:

```sql
-- Add freshness columns
ALTER TABLE findings ADD COLUMN IF NOT EXISTS source_published_date date;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_flag text DEFAULT 'undated';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_priority int DEFAULT 2;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_findings_freshness ON findings(freshness_priority, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_findings_source_date ON findings(source_published_date DESC);

-- Flag historical data for review
UPDATE findings 
SET freshness_flag = 'needs_review', freshness_priority = 2
WHERE source_published_date IS NULL AND created_at < CURRENT_DATE;
```

---

## Cleanup for Historical Data

Run the cleanup script to flag all existing findings:

```bash
node /app/scripts/cleanup_historical_data.js
```

**What it does:**
1. Counts findings without freshness validation
2. Flags them as `needs_review` with priority 2
3. Reports distribution by freshness category
4. Leaves findings in place (doesn't delete)

**Why `needs_review` instead of deletion:**
- Preserves historical research value
- Allows manual audit if needed
- Can be filtered out in queries: `?freshness_flag=neq.needs_review`

---

## How to Verify It's Working

### 1. Check Cron Logs
After a Monday run, look for these log messages:

```
[YNOT] Applying freshness validation (7-day window)...
[YNOT] Freshness validation: 27 → 25 findings retained
[YNOT] Removed stale ref (2025-05-22): https://nbcphiladelphia.com/...
```

### 2. Query Fresh Findings Only
```bash
curl "https://ynot-now.vercel.app/api/pulse?section=spotlight" | jq '.top_findings[] | {title, freshness_flag, source_published_date}'
```

### 3. Inspect Database
```sql
SELECT 
  freshness_flag, 
  COUNT(*) as count,
  MIN(source_published_date) as oldest,
  MAX(source_published_date) as newest
FROM findings
WHERE run_date >= '2026-03-09'  -- After fix deployment
GROUP BY freshness_flag;
```

Expected output:
- `fresh`: Most findings, dates within last 7 days
- `undated`: Some findings, no date info
- `stale`: **Should be 0** (validation removes these)

---

## Freshness Priority Reference

| Priority | Flag | Meaning | Example |
|----------|------|---------|---------|
| **1** | `fresh` | Source published < 7 days ago | Article from March 5, 2026 (4 days ago) |
| **2** | `undated` | No publication date available | GitHub repo, no date metadata |
| **3** | `stale` | Source published > 7 days ago | **Filtered out, never stored** |
| **2** | `needs_review` | Historical data from before fix | Pre-March 9, 2026 findings |

---

## FAQ

### Q: What if Tavily returns no results with `days: 7`?
**A:** The agent logs "no results, skipping" and produces 0 findings for that run. This is rare but acceptable — better than publishing stale content.

### Q: Can we relax to 14 days during slow news weeks?
**A:** No. User requirement is strict 7 days. If a week has low signal, that's valuable information itself ("Quiet week in insurance AI").

### Q: What about evergreen content like research papers?
**A:** If the paper was published > 7 days ago, it won't appear in "last week's briefing." It may appear later if cited in a fresh article/discussion.

### Q: Do undated sources hurt credibility?
**A:** They're deprioritized (priority 2) but allowed because some high-quality sources (GitHub repos, regulatory pages) lack date metadata. Fresh dated sources always rank higher.

### Q: Should we delete historical flagged findings?
**A:** No. Keep them for research/audit purposes. Filter them out in queries if needed: `?freshness_flag=neq.needs_review`

---

## Monitoring & Alerts

**Key Metrics to Track:**
1. **Freshness ratio:** `COUNT(fresh) / COUNT(*)` per run (target: > 80%)
2. **Stale rejections:** Log count of removed stale refs (should be > 0 initially, then → 0)
3. **Undated ratio:** `COUNT(undated) / COUNT(*)` (target: < 20%)

**Alert conditions:**
- If > 3 findings removed due to staleness → Tavily `days` filter may not be working
- If 0 findings after freshness validation → Queries may be too narrow
- If undated ratio > 40% → Source quality issue, review agent queries

---

## Files Modified

| File | Change | Layer |
|------|--------|-------|
| `api/cron.js` | Add `days: 7` to Tavily, update prompts, add validation | 1, 2, 3 |
| `api/cron-synthesise.js` | Same as above for synthesis agents | 1, 2, 3 |
| `api/pulse.js` | Sort by freshness_priority | 4 |
| `scripts/add_freshness_columns.sql` | Database schema migration | N/A |
| `scripts/cleanup_historical_data.js` | Historical data flagging | N/A |

---

## Rollback Plan

If the system causes issues:

1. **Remove Tavily date filter** (revert Layer 1):
   ```javascript
   // Remove: days: 7,
   ```

2. **Remove prompt instructions** (revert Layer 2):
   Remove "CRITICAL DATE REQUIREMENT..." from prompts

3. **Disable validation function** (revert Layer 3):
   ```javascript
   // Comment out:
   // allFindings = validateSourceFreshness(allFindings);
   ```

4. **Revert pulse sorting** (revert Layer 4):
   Sort by confidence only, ignore freshness_priority

**Database columns can stay** — they'll just be unused and default to `undated`.

---

## Future Enhancements

1. **Dynamic freshness window** - Allow 14 days for slow news periods (requires user approval)
2. **Source reputation scoring** - Track domains that consistently provide fresh content
3. **Date extraction** - For undated sources, attempt to scrape publication date from HTML
4. **Freshness badges** - Show 🟢 Fresh / 🟡 Undated badges in frontend UI
5. **Weekly freshness report** - Email admins with freshness metrics after each run

---

## Credits

**Issue discovered:** 2026-03-09  
**Root cause:** No date validation in 4-agent pipeline (Scout, Vita, Lex, Terra, Horizon, Null, Weave, Faro)  
**Fixed by:** 4-layer validation system (Tavily + Prompts + Code + Output)  
**Tested:** Pending first Monday run after deployment

---

**Remember:** Credibility is everything for YNOT.NOW. Source freshness is non-negotiable. 🎯
