# 🚀 OPTION B: FULL MIGRATION & CLEANUP - STEP-BY-STEP GUIDE

**Time Required:** ~15 minutes  
**What You'll Do:**
1. Add freshness validation columns to database
2. Flag old data as 'needs_review'
3. Update code to filter out old data (already done)
4. Deploy and verify

---

## 📋 STEP 1: DATABASE MIGRATION (5 minutes)

### **Go to Supabase:**
1. Open https://app.supabase.io/
2. Select your project (wsplocidlmtfpvzudzdz)
3. Click **SQL Editor** in left sidebar
4. Click **New Query**

### **Run this SQL:**

Copy and paste this entire block, then click **RUN**:

```sql
-- Add freshness validation columns
ALTER TABLE findings ADD COLUMN IF NOT EXISTS source_published_date date;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_flag text DEFAULT 'undated';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_priority int DEFAULT 2;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_findings_freshness ON findings(freshness_priority, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_findings_source_date ON findings(source_published_date DESC);

-- Flag all historical findings (including NBC article)
UPDATE findings 
SET freshness_flag = 'needs_review', 
    freshness_priority = 3
WHERE source_published_date IS NULL 
  AND created_at < CURRENT_DATE;
```

### **Verify it worked:**

Run this query:

```sql
SELECT 
  freshness_flag, 
  COUNT(*) as count
FROM findings
GROUP BY freshness_flag;
```

**Expected output:**
```
freshness_flag  | count
----------------|-------
needs_review    | 487 (or however many old findings you have)
```

---

## 📋 STEP 2: DEPLOY UPDATED CODE (2 minutes)

I've just updated `pulse.js` to filter out old data. You need to deploy this change:

```bash
cd /app
git add api/pulse.js
git commit -m "Filter out historical needs_review findings from pulse"
git push origin main
```

**Vercel will auto-deploy in ~1 minute.**

---

## 📋 STEP 3: VERIFY OLD DATA IS HIDDEN (3 minutes)

### **Check the API:**

```bash
curl "https://ynot-now.vercel.app/api/pulse?section=spotlight" | jq '.top_findings[] | {title, freshness_flag}'
```

**Expected:** You should NOT see the NBC Claude 4 article anymore.

### **Check the website:**

1. Go to https://ynot-now.vercel.app
2. Refresh (Ctrl+Shift+R / Cmd+Shift+R to bypass cache)
3. Look at the latest briefing

**Expected:** NBC May 2025 article should be GONE.

---

## 📋 STEP 4: TEST WITH FRESH DATA (5 minutes - OPTIONAL)

If you want to see the freshness validation working on NEW data, trigger a manual cron run:

```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```

**This will:**
- Run all 5 Phase 1 agents (Scout, Vita, Lex, Terra, Horizon)
- Apply freshness validation (only sources from last 7 days)
- Create new findings with `freshness_flag: 'fresh'` or `'undated'`
- Take ~30-60 seconds

**Then check the logs for:**
```
[YNOT] Applying freshness validation (7-day window)...
[YNOT] Freshness validation: 27 → 25 findings retained
```

**After it completes, run:**
```bash
curl "https://ynot-now.vercel.app/api/pulse?section=spotlight&force=true" | jq '.top_findings[] | {title, freshness_flag, source_published_date}'
```

**Expected output:**
```json
{
  "title": "Some recent finding",
  "freshness_flag": "fresh",
  "source_published_date": "2026-03-07"
}
```

---

## ✅ SUCCESS CHECKLIST

- [ ] **Database migration complete** - 3 columns + 2 indexes added
- [ ] **Historical data flagged** - All old findings marked as `needs_review`
- [ ] **Code deployed** - pulse.js filters out `needs_review` findings
- [ ] **Website verified** - NBC May 2025 article no longer visible
- [ ] **(Optional) Test run** - Manual cron shows freshness validation working

---

## 🎯 WHAT JUST HAPPENED

**Before:**
- ❌ Old NBC article visible (May 2025)
- ❌ No freshness tracking
- ❌ No validation on new data

**After:**
- ✅ Old data flagged and hidden from view
- ✅ Database has freshness columns
- ✅ New findings will be validated (only last 7 days)
- ✅ Fresh findings prioritized over undated

---

## 🔮 NEXT MONDAY (Automatic)

**Monday 06:00 UTC:**
- Phase 1 cron runs automatically
- Tavily only returns sources from last 7 days
- Agents reject old sources
- Programmatic validation removes any stale refs that slip through
- ALL new findings will have `freshness_flag: 'fresh'` or `'undated'`

**You don't need to do anything else!** The system is now protecting your credibility automatically. 🛡️

---

## 🆘 TROUBLESHOOTING

**If you still see the NBC article after Step 3:**

1. **Clear your browser cache** - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. **Check database** - Run this in Supabase:
   ```sql
   SELECT title, freshness_flag 
   FROM findings 
   WHERE title ILIKE '%claude%' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
   NBC article should have `freshness_flag: 'needs_review'`

3. **Check API directly** - The curl command above should NOT return old articles

4. **Verify deployment** - Check Vercel dashboard that latest commit is deployed

**If issues persist, let me know what you're seeing!**
