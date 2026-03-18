# VERDICT SYSTEM MIGRATION: NOISE → UNVERIFIED

**Migration Date:** 2026-03-09  
**Purpose:** Protect legal interests and credibility with defensible verdict criteria  
**Impact:** All NOISE findings → UNVERIFIED (automatic conversion)

---

## ✅ WHAT'S BEEN DONE

### **Code Changes:**
1. ✅ Updated `normalizeVerdict()` in both cron files - auto-converts NOISE → UNVERIFIED
2. ✅ Updated all agent prompts with objective criteria
3. ✅ Changed Null agent from "skeptic" → "verification analyst"
4. ✅ Updated pulse.js to handle UNVERIFIED verdict
5. ✅ Backward compatible - legacy NOISE data still works

### **Files Modified:**
- `/app/api/cron.js`
- `/app/api/cron-synthesise.js`
- `/app/api/pulse.js`
- `/app/YNOT-CONTEXT.md`
- `/app/VERDICT_SYSTEM_LEGAL_SAFE.md` (new)

---

## 📊 DATABASE MIGRATION (OPTIONAL)

**Current state:** NOISE values exist in `findings.verdict` column  
**New state:** Auto-converted to UNVERIFIED by code  
**Action:** OPTIONAL - Update database values for consistency

```sql
-- Optional: Convert all NOISE → UNVERIFIED in database
UPDATE findings 
SET verdict = 'UNVERIFIED' 
WHERE verdict = 'NOISE';

-- Verify conversion
SELECT verdict, COUNT(*) 
FROM findings 
GROUP BY verdict;
```

**Expected output:**
- SIGNAL: X findings
- WATCH: Y findings
- UNVERIFIED: Z findings
- NOISE: 0 findings (if migration run)

**Note:** If you DON'T run this SQL, the code still works — `normalizeVerdict()` converts NOISE → UNVERIFIED automatically.

---

## 🎯 TESTING THE NEW SYSTEM

### **1. Trigger a test cron run:**

```powershell
Invoke-RestMethod -Uri "https://your-vercel-url/api/cron" -Method GET -Headers @{Authorization="Bearer ynot-secret-2025"}
```

### **2. Check the new findings:**

```sql
SELECT title, verdict, confidence, body
FROM findings
WHERE run_date >= CURRENT_DATE
ORDER BY verdict, confidence DESC;
```

**Expected:**
- SIGNAL findings have 2+ sources, specific numbers, confidence ≥ 4
- WATCH findings have 1 source or early-stage, confidence 2-3
- UNVERIFIED findings state "cannot independently verify", confidence 1-2
- NO NOISE findings

### **3. Review UNVERIFIED findings manually:**

```sql
SELECT title, verdict, body, refs
FROM findings
WHERE verdict = 'UNVERIFIED'
  AND run_date >= CURRENT_DATE;
```

**Check each one:**
- [ ] Body uses factual language ("cannot independently verify")
- [ ] Does NOT use judgmental language ("hype", "false", "noise")
- [ ] Confidence is 1-2
- [ ] Refs are accurately cited

---

## 🧑‍⚖️ LEGAL REVIEW PROCESS

**For the first 2-3 weeks after deployment:**

### **Monday Morning (After Cron Run):**
1. Query all UNVERIFIED findings from latest run
2. Review each for legal risk
3. Check framing is factual, not judgmental
4. If any name companies critically, flag for legal review
5. Approve or modify before website publishes

### **Red Flags (Requires Extra Review):**
- Company names + critical claims
- Language like "misleading", "false", "hype"
- Implications of fraud or deception
- Specific financial harm claims

### **Approval Checklist:**
- [ ] Factual framing only
- [ ] "Cannot independently verify" language
- [ ] Sources accurately cited
- [ ] No defamatory implications
- [ ] Benefit of doubt given

---

## 📝 FRONTEND DISPLAY CHANGES

**Current display:**
- SIGNAL → Green badge "SIGNAL"
- WATCH → Yellow badge "WATCH"
- NOISE → Red badge "NOISE"

**New display:**
- SIGNAL → Green badge "SIGNAL"
- WATCH → Yellow badge "WATCH"
- UNVERIFIED → Gray badge "UNVERIFIED"

**Update frontend CSS/styling if needed.**

---

## 🔄 COMMUNICATION STRATEGY

### **To Users (Optional Announcement):**

```
📊 Platform Update: More Rigorous Verdict Criteria

We've enhanced our verdict system to be more objective and defensible:

• SIGNAL: Independently verified with multiple sources
• WATCH: Emerging, worth monitoring
• UNVERIFIED: Cannot independently confirm (replaces "Noise")

"UNVERIFIED" means we couldn't verify through third-party sources — 
not that the claim is false. This factual framing protects our independence 
while maintaining critical analysis.

See our methodology: ynot.now/methodology
```

### **To Companies (If Asked):**

```
YNOT.NOW uses objective criteria for verdict classification:

UNVERIFIED means: "We could not independently verify this claim through 
third-party sources at the time of publication."

This is a factual statement about verification status, not a quality 
judgment. We welcome additional sources for verification.

See full criteria: [link to VERDICT_SYSTEM_LEGAL_SAFE.md]
```

---

## ✅ POST-MIGRATION CHECKLIST

- [ ] Code deployed to Vercel
- [ ] Test cron run successful
- [ ] New findings use SIGNAL/WATCH/UNVERIFIED (no NOISE)
- [ ] Criteria documented and accessible
- [ ] Team trained on new system
- [ ] Legal review process in place
- [ ] Frontend displays UNVERIFIED badge correctly
- [ ] (Optional) Database migration run
- [ ] (Optional) User announcement published

---

## 📊 MONITORING (First Month)

**Track these metrics:**

1. **Verdict distribution:**
   - SIGNAL: Should be 30-50%
   - WATCH: Should be 30-50%
   - UNVERIFIED: Should be 10-30%

2. **Confidence correlation:**
   - SIGNAL: Average confidence ≥ 4
   - WATCH: Average confidence 2-3
   - UNVERIFIED: Average confidence 1-2

3. **Legal challenges:** Track any company complaints or challenges

4. **User feedback:** Monitor reactions to new system

**Alert if:**
- UNVERIFIED > 40% (criteria too strict?)
- Any legal challenges to verdicts
- Users confused by UNVERIFIED framing

---

## 🎓 TRAINING MATERIALS

**For team/editorial reviewers:**

1. Read `/app/VERDICT_SYSTEM_LEGAL_SAFE.md`
2. Review example findings (before/after)
3. Practice: Given a finding, assign verdict using criteria
4. Understand legal implications of each verdict
5. Know escalation protocol for risky findings

---

## 🆘 ROLLBACK PLAN

**If the new system causes issues:**

### **Quick Rollback (Code):**
```bash
git revert HEAD
git push origin main
```

### **Database Rollback (If migration was run):**
```sql
-- This would require backups or manual review
-- DON'T revert automatically - consult legal first
```

**Recommendation:** Don't rollback unless legally necessary. The new system is MORE defensible, not less.

---

## ✅ SUCCESS CRITERIA

**Migration successful when:**
- ✅ All new findings use SIGNAL/WATCH/UNVERIFIED
- ✅ UNVERIFIED findings are factually framed
- ✅ Zero legal challenges to verdicts
- ✅ Team confident in applying criteria
- ✅ Users understand and trust the system

---

**REMEMBER:** UNVERIFIED ≠ FALSE. It's a factual statement about verification status that protects your credibility and legal interests. 🛡️
