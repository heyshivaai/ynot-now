# 🚨 FRESHNESS VALIDATION - QUICK REFERENCE

**Updated:** 2026-03-09 | **Status:** ✅ Active

---

## 🎯 THE RULE

**ONLY sources from the last 7 days appear in weekly briefings.**

---

## 🛡️ THE 4 LAYERS

| Layer | What | Where | Effect |
|-------|------|-------|--------|
| **1** | Tavily `days: 7` | `tavilySearch()` | Filters at API level |
| **2** | Prompt instructions | Agent system prompts | Claude rejects old sources |
| **3** | Programmatic filter | `validateSourceFreshness()` | Removes stale refs |
| **4** | Output prioritization | `pulse.js` sorting | Fresh findings first |

---

## 📊 FRESHNESS PRIORITY

| Priority | Flag | Meaning | Action |
|----------|------|---------|--------|
| **1** | `fresh` | < 7 days old | ✅ Prioritized |
| **2** | `undated` | No date | ⚠️ Allowed but deprioritized |
| **3** | `stale` | ≥ 7 days old | ❌ Removed |
| **2** | `needs_review` | Historical pre-fix | 🔍 Flagged for audit |

---

## 🗄️ DATABASE FIELDS

```sql
findings.source_published_date  -- date
findings.freshness_flag          -- text
findings.freshness_priority      -- int (1, 2, or 3)
```

---

## 🧪 HOW TO TEST

### **Check Logs:**
```bash
# Look for these in Vercel function logs:
[YNOT] Applying freshness validation (7-day window)...
[YNOT] Freshness validation: 27 → 25 findings retained
[YNOT] Removed stale ref (2025-05-22): https://...
```

### **Query Database:**
```sql
SELECT freshness_flag, COUNT(*) 
FROM findings 
WHERE run_date = CURRENT_DATE
GROUP BY freshness_flag;
```

Expected: `fresh` > 80%, `stale` = 0

### **Check API:**
```bash
curl "https://ynot-now.vercel.app/api/pulse?section=spotlight" \
  | jq '.top_findings[].freshness_flag'
```

Expected: `"fresh"` or `"undated"`, never `"stale"`

---

## 🚨 TROUBLESHOOTING

| Symptom | Cause | Fix |
|---------|-------|-----|
| **All agents return 0 findings** | Tavily `days: 7` too restrictive | Check if there's actually news this week |
| **Stale refs still appearing** | Tavily API issue | Check Layer 3 logs - should catch them |
| **> 50% undated findings** | Poor source quality | Review agent queries |
| **Findings removed after validation** | Working as intended | Logged with warning |

---

## 📞 QUICK COMMANDS

### **Manual Cron Trigger:**
```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```

### **Run Cleanup Script:**
```bash
export SUPABASE_URL="https://wsplocidlmtfpvzudzdz.supabase.co"
export SUPABASE_SERVICE_KEY="your-key"
node /app/scripts/cleanup_historical_data.js
```

### **Database Migration:**
```bash
# Copy /app/scripts/add_freshness_columns.sql
# Paste into Supabase SQL Editor
# Run
```

---

## 📖 FULL DOCS

- **Complete Guide:** `/app/FRESHNESS_VALIDATION.md`
- **Deployment Steps:** `/app/DEPLOYMENT_CHECKLIST.md`
- **Implementation Details:** `/app/IMPLEMENTATION_SUMMARY.md`
- **Project Context:** `/app/YNOT-CONTEXT.md`

---

## ✅ SUCCESS CHECKLIST

- [ ] Database migration complete (3 columns + 2 indexes)
- [ ] Code deployed (cron.js, cron-synthesise.js, pulse.js updated)
- [ ] Historical data flagged (cleanup script run)
- [ ] Test run successful (manual cron trigger)
- [ ] Freshness validation logs visible
- [ ] No stale sources in latest findings
- [ ] Frontend shows fresh data only

---

**Remember:** Credibility = Source Freshness. This system protects YNOT.NOW's promise. 🎯
