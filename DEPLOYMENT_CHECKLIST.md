# 🚨 DEPLOYMENT CHECKLIST: Freshness Validation System

**Deployment Date:** 2026-03-09  
**Critical Fix:** Prevents outdated sources from appearing in weekly briefings  
**Incident:** NBC article from May 2025 appeared in March 2026 briefing

---

## ✅ PRE-DEPLOYMENT CHECKLIST

### 1. **Code Changes Verified**
- [ ] `/app/api/cron.js` - Tavily date filter added, prompts updated, validation function added
- [ ] `/app/api/cron-synthesise.js` - Same changes as above
- [ ] `/app/api/pulse.js` - Freshness prioritization added
- [ ] All syntax errors resolved (run linter)

### 2. **Database Migration Ready**
- [ ] `/app/scripts/add_freshness_columns.sql` created
- [ ] SQL syntax verified
- [ ] Backup plan in place (Supabase has automatic backups)

### 3. **Cleanup Script Ready**
- [ ] `/app/scripts/cleanup_historical_data.js` created and executable
- [ ] Environment variables confirmed (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)

### 4. **Documentation Complete**
- [ ] `/app/FRESHNESS_VALIDATION.md` created
- [ ] `/app/YNOT-CONTEXT.md` updated
- [ ] This deployment checklist created

---

## 📋 DEPLOYMENT STEPS

### **Step 1: Database Migration (10 min)**

**Run on Supabase SQL Editor:**

```sql
-- Copy the entire contents of /app/scripts/add_freshness_columns.sql
-- and execute in Supabase SQL Editor
```

**Verify:**
```sql
-- Check columns exist
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'findings' 
  AND column_name IN ('source_published_date', 'freshness_flag', 'freshness_priority');

-- Check indexes exist
SELECT indexname FROM pg_indexes 
WHERE tablename = 'findings' 
  AND indexname LIKE '%freshness%';
```

Expected output: 3 columns + 2 indexes should exist.

---

### **Step 2: Deploy Code Changes**

**If using Git/Vercel auto-deploy:**
```bash
cd /app
git add api/cron.js api/cron-synthesise.js api/pulse.js
git add scripts/*.sql scripts/*.js
git add FRESHNESS_VALIDATION.md YNOT-CONTEXT.md
git commit -m "feat: Add 4-layer freshness validation system

- Tavily date filter (days: 7)
- Agent prompts updated with date requirements
- Programmatic validation removes stale refs
- Pulse prioritizes fresh findings
- Closes credibility issue: NBC May 2025 in March 2026 briefing"

git push origin main
```

**Vercel will auto-deploy.** Monitor: https://vercel.com/your-project/deployments

---

### **Step 3: Run Historical Data Cleanup (5 min)**

**After code deploys, run cleanup:**

```bash
# SSH into Vercel serverless function OR run locally with env vars:
export SUPABASE_URL="https://wsplocidlmtfpvzudzdz.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-key-here"

node /app/scripts/cleanup_historical_data.js
```

**Expected output:**
```
═══════════════════════════════════════════════════════════
  YNOT.NOW - Historical Data Freshness Cleanup
═══════════════════════════════════════════════════════════

[1/4] Counting historical findings without freshness validation...
      Total findings in database: 487
      Findings without freshness_flag: 487

[2/4] Flagging historical findings for review...
      ✓ 487 findings flagged as 'needs_review'

[3/4] Current freshness distribution:
      Fresh (< 7 days):       0
      Undated:                0
      Stale (> 7 days):       0
      Needs Review:           487

[4/4] Cleanup complete!
```

---

### **Step 4: Test with Manual Cron Trigger (10 min)**

**Trigger a test run:**

```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```

**Monitor logs for:**
- `[YNOT] Applying freshness validation (7-day window)...`
- `[YNOT] Freshness validation: X → Y findings retained`
- `[YNOT] Removed stale ref (YYYY-MM-DD): https://...` (should NOT happen if Tavily filter works)

**Expected behavior:**
- Most findings should have `freshness_flag: 'fresh'` or `freshness_flag: 'undated'`
- NO findings should have refs older than 7 days
- If Tavily returns 0 results for a query, agent logs "no results, skipping"

---

### **Step 5: Verify in Database (5 min)**

**Query latest run:**

```sql
-- Get latest run_id
SELECT DISTINCT run_id, run_date, COUNT(*) as findings
FROM findings
WHERE run_date >= CURRENT_DATE - INTERVAL '1 day'
GROUP BY run_id, run_date
ORDER BY run_date DESC
LIMIT 1;

-- Check freshness distribution for latest run
SELECT 
  freshness_flag, 
  COUNT(*) as count,
  MIN(source_published_date) as oldest_source,
  MAX(source_published_date) as newest_source
FROM findings
WHERE run_id = 'run_XXXXX'  -- Replace with actual run_id
GROUP BY freshness_flag;
```

**Expected output for March 9, 2026 run:**
- `fresh`: 20-30 findings, oldest_source >= March 2, 2026 (7 days ago)
- `undated`: 5-10 findings, NULL dates
- `stale`: **0 findings** (validation should remove these)
- `needs_review`: 0 (only historical data)

---

### **Step 6: Verify in Frontend (5 min)**

**Test pulse API:**

```bash
curl "https://ynot-now.vercel.app/api/pulse?section=spotlight" | jq '.'
```

**Check:**
- `top_findings[]` should have `freshness_flag` and `source_published_date`
- Findings should be sorted with fresh first
- No findings with sources > 7 days old

**Test on live site:**
1. Visit https://ynot-now.vercel.app
2. Check latest briefing
3. Click "Learn more" on bullets to expand findings
4. Inspect source refs — all should be recent (within 7 days)

---

## 🚨 ROLLBACK PLAN (if issues detected)

### **Immediate Rollback (Code Only)**

**Revert code changes via Git:**
```bash
git revert HEAD  # Reverts the freshness validation commit
git push origin main
```

Vercel will auto-deploy the rollback. **Database columns can stay** — they're unused with old code.

### **Full Rollback (Code + Database)**

**Only if database migration causes issues:**

```sql
-- Remove columns (CAUTION: loses data)
ALTER TABLE findings DROP COLUMN IF EXISTS source_published_date;
ALTER TABLE findings DROP COLUMN IF EXISTS freshness_flag;
ALTER TABLE findings DROP COLUMN IF EXISTS freshness_priority;

-- Remove indexes
DROP INDEX IF EXISTS idx_findings_freshness;
DROP INDEX IF EXISTS idx_findings_source_date;
```

---

## ✅ POST-DEPLOYMENT VERIFICATION

### **Success Criteria:**

1. **Code deployed** - Vercel shows successful deployment
2. **Database updated** - 3 new columns + 2 indexes exist
3. **Historical data flagged** - All old findings have `freshness_flag: 'needs_review'`
4. **Test run successful** - Manual cron trigger produces findings with freshness data
5. **No stale sources** - All refs in latest run are < 7 days old OR undated
6. **Frontend works** - Pulse API returns fresh findings, site loads correctly

### **Monitoring (First Week)**

**Daily checks:**
- View Vercel function logs for Monday cron runs
- Count findings by freshness_flag: `fresh` should be > 80%
- Check for warnings: "Removed stale ref" (should trend to 0)

**Alert if:**
- > 5 findings removed due to staleness in a single run (Tavily filter may be broken)
- 0 findings produced after validation (queries too narrow)
- Undated findings > 40% (source quality issue)

---

## 📞 SUPPORT CONTACTS

**If deployment fails:**
- Check Vercel logs: https://vercel.com/your-project/deployments
- Check Supabase logs: https://app.supabase.io/project/wsplocidlmtfpvzudzdz/logs
- Review `/app/FRESHNESS_VALIDATION.md` for troubleshooting

**Emergency contact:**
- Project owner: heyshiva.ai@gmail.com
- Vercel support: https://vercel.com/support

---

## 📊 EXPECTED METRICS (First Monday After Deploy)

| Metric | Before Fix | After Fix |
|--------|------------|-----------|
| **Stale sources** | Unknown (NBC May 2025 made it through) | **0** |
| **Fresh findings** | Unknown | > 80% |
| **Undated findings** | Unknown | 10-20% |
| **Total findings** | ~27-42 per week | ~25-40 (slightly lower due to filtering) |
| **Credibility incidents** | 1 known | **0** |

---

## ✅ SIGN-OFF

- [ ] **Tech Lead:** Code reviewed and approved
- [ ] **DBA:** Database migration verified
- [ ] **QA:** Test run successful
- [ ] **Product:** Confirms fix addresses credibility issue
- [ ] **DevOps:** Rollback plan understood

**Deployment authorized by:** _____________________  
**Date:** 2026-03-09  
**Time:** __________

---

🎯 **Mission:** Protect YNOT.NOW's credibility by ensuring only fresh sources (< 7 days) appear in weekly briefings.
