# VERDICT SYSTEM: LEGAL-SAFE CLASSIFICATION FRAMEWORK

**Last Updated:** 2026-03-09  
**Status:** ✅ Active  
**Purpose:** Protect credibility and legal interests with objective, defensible verdict criteria

---

## 🛡️ THE PROBLEM WE SOLVED

**Before:** Findings were classified as "NOISE" based on subjective AI judgment
- ❌ "Noise" implied claims were false or worthless
- ❌ No clear, documented methodology
- ❌ Legal liability risk (potential defamation)
- ❌ Credibility damage if challenged

**Example issue:** Crawford & Company finding labeled "NOISE" - implies their 75% claims processing speed claim is false/hype without rigorous proof.

---

## ✅ THE NEW SYSTEM: SIGNAL / WATCH / UNVERIFIED

### **Verdict Definitions**

| Verdict | Meaning | Framing | Legal Status |
|---------|---------|---------|--------------|
| **SIGNAL** | Independently verified, evidenced | Positive assertion | ✅ Defensible |
| **WATCH** | Emerging, limited evidence | Neutral observation | ✅ Defensible |
| **UNVERIFIED** | Cannot independently confirm | Factual statement about verification status | ✅ Defensible |

---

## 📋 OBJECTIVE CRITERIA (Defensible in Court)

### **SIGNAL: Independently Verified & Evidenced**

**MUST meet ALL of these:**
1. ✅ **Multiple independent sources** (2+ refs from different organizations)
2. ✅ **Quantified claims** with specific numbers/data
3. ✅ **Named deployments** or peer-reviewed research
4. ✅ **Confidence ≥ 4** (high confidence based on evidence)

**Examples of SIGNAL:**
- "Munich Re deploys flood prediction AI across 15 markets, achieving 23% loss ratio improvement per Q4 2025 report"
- "NIST publishes framework for insurance AI risk assessment, adopted by 7 state regulators"
- "Peer-reviewed study in Insurance: Mathematics & Economics shows 18% efficiency gain in claims automation"

**What makes it SIGNAL:**
- Named entity (Munich Re, NIST)
- Specific numbers (15 markets, 23%, 7 regulators, 18%)
- Verifiable sources (Q4 report, peer-reviewed journal)

---

### **WATCH: Emerging, Worth Monitoring**

**Characteristics:**
1. ⚠️ **Single source** OR early-stage development
2. ⚠️ **Qualitative claims** or limited quantitative data
3. ⚠️ **Worth monitoring** as evidence develops
4. ⚠️ **Confidence 2-3** (moderate, needs more evidence)

**Examples of WATCH:**
- "InsurTech startup announces AI underwriting platform launch in beta"
- "Industry conference panel discusses potential of generative AI in claims"
- "Single carrier reports testing computer vision for property damage assessment"

**What makes it WATCH:**
- Early stage (beta, testing, discussing)
- Single source or limited deployment
- Lacks independent verification YET
- Still worth tracking for future development

---

### **UNVERIFIED: Cannot Independently Confirm**

**CRITICAL: This is a FACTUAL statement about verification status, NOT a quality judgment.**

**Characteristics:**
1. 🔍 **Claims lack independent third-party validation**
2. 🔍 **Single vendor/promotional source only**
3. 🔍 **Quantified claims with no external benchmarks**
4. 🔍 **Not necessarily false**, but verification status unclear
5. 🔍 **Confidence 1-2** (low confidence in current verification, not in the claim itself)

**Examples of UNVERIFIED:**
- "Company X press release claims 75% speed improvement in claims processing" (no external audit)
- "Vendor white paper reports 95% accuracy in fraud detection" (no independent testing)
- "Marketing materials cite customer success without named references"

**Framing (CRITICAL):**
- ✅ "This claim could not be independently verified through third-party sources"
- ✅ "Reported by vendor, no external validation available"
- ✅ "Claims lack independent benchmarking"
- ❌ "This is hype" (subjective)
- ❌ "This is noise" (judgmental)
- ❌ "This is false" (accusatory)

**Legal safety:** We're stating a FACT (we cannot verify) not making a JUDGMENT (this is bad/false).

---

## 🎯 HOW THE AI DECIDES

### **Updated Agent Prompts**

**All agents now receive explicit criteria:**

```
VERDICT CRITERIA (use these objective rules):

• SIGNAL: (1) Multiple independent sources (2+ refs from different organizations), 
           (2) Quantified claims with specific numbers/data, 
           (3) Named deployments or peer-reviewed research, 
           (4) Confidence ≥ 4.

• WATCH: (1) Single source OR early-stage development, 
         (2) Qualitative claims or limited data, 
         (3) Worth monitoring as evidence develops, 
         (4) Confidence 2-3.

• UNVERIFIED: (1) Claims lack independent third-party validation, 
              (2) Single vendor/promotional source only, 
              (3) Quantified claims with no external benchmarks, 
              (4) Not necessarily false, but verification status unclear. 
              Use UNVERIFIED for factual accuracy — this means "we cannot independently verify" 
              not "this is false." Confidence 1-2.

IMPORTANT: UNVERIFIED is a factual statement about verification status, not a quality judgment. 
Frame objectively.
```

---

## 🔄 LEGACY SUPPORT

**Old NOISE findings are automatically converted:**
- Database normalization: `NOISE` → `UNVERIFIED`
- Frontend display: Shows as "UNVERIFIED"
- No data loss, backwards compatible

---

## 🧑‍⚖️ LEGAL REVIEW CHECKLIST

**Before publishing any UNVERIFIED finding, confirm:**

- [ ] Body text states facts, not opinions
- [ ] Uses "cannot independently verify" language
- [ ] Does NOT say "false", "hype", "misleading", "exaggerated"
- [ ] Sources cited accurately
- [ ] No defamatory implications
- [ ] Confidence score reflects verification status (1-2)

**Red flags (requires editorial review):**
- Naming specific companies with critical claims
- Implying fraud or intentional misrepresentation
- Using loaded language ("washing", "fake", "scam")

---

## 📊 EXAMPLE COMPARISON

### **Crawford & Company Finding - Before vs After**

**Before (RISKY):**
```
Title: Crawford & Company's 75% Claims Processing Speed Claims Lack Independent Verification 
       Amid Industry-Wide AI Pilot Failures
Verdict: NOISE
Body: While Crawford & Company reports achieving 75% speed improvements, multiple industry 
      sources indicate 95% of AI pilots fail...
```

**Problems:**
- "NOISE" = subjective judgment
- Title implies deception ("Lack Independent Verification")
- "AI Pilot Failures" sounds accusatory
- Could be read as defamatory

---

**After (SAFE):**
```
Title: Automated Claims Processing Speed Claims Await Independent Benchmarking
Verdict: UNVERIFIED
Body: Crawford & Company reports 75% speed improvements in straight-through claims processing. 
      Industry benchmarking data indicates 95% of AI pilots do not advance past pilot stage, 
      and only 30% of insurer AI projects report independent validation. This specific claim 
      has not been externally verified through peer-reviewed benchmarks.
Experiment: Conduct independent benchmarking study of automated claims processing speeds 
            across multiple vendors to verify vendor-reported performance improvements.
```

**Improvements:**
- ✅ Factual, not judgmental
- ✅ "UNVERIFIED" = verification status, not quality
- ✅ Cites industry context without accusing Crawford
- ✅ Experiment suggests path to verification
- ✅ Legally defensible

---

## 🎓 TRAINING FOR EDITORIAL REVIEW

**If you're reviewing findings, ask:**

1. **Is this factual?** Does it state what we know vs what we believe?
2. **Is it defensible?** Could we defend this in court with our sources?
3. **Is it fair?** Does it give companies benefit of the doubt?
4. **Is it valuable?** Does this help readers understand verification status?

**Remember:** UNVERIFIED ≠ FALSE. It means "we couldn't confirm through independent sources."

---

## 🚀 DEPLOYMENT STATUS

**Code changes deployed:**
- ✅ `api/cron.js` - Updated verdict criteria, NOISE → UNVERIFIED
- ✅ `api/cron-synthesise.js` - Updated Null agent role ("verification analyst"), new criteria
- ✅ `api/pulse.js` - Updated display logic
- ✅ Backward compatible - old NOISE findings auto-convert

**Next steps:**
1. **Human review** - Flag existing UNVERIFIED findings for editorial review
2. **Monitor** - First few weeks, manually check UNVERIFIED findings before publish
3. **Refine** - Adjust criteria based on real-world usage

---

## 📞 ESCALATION PROTOCOL

**If an UNVERIFIED finding feels risky:**

1. **Pause publication** - Don't publish until reviewed
2. **Check criteria** - Does it meet UNVERIFIED criteria objectively?
3. **Reframe if needed** - Can we state it more factually?
4. **Legal review** - If it names companies critically, get legal review
5. **Document decision** - Keep record of why published/not published

---

## ✅ SUCCESS METRICS

**We've succeeded when:**
- ✅ Zero legal challenges to our verdict classifications
- ✅ Companies can't dispute our UNVERIFIED label (it's factual)
- ✅ Users trust our methodology (transparent, objective)
- ✅ Credibility maintained while staying critical/skeptical

---

**BOTTOM LINE:** We protect your interests by being factual, not judgmental. UNVERIFIED tells readers "we couldn't independently verify this" — which is defensible truth, not defamatory opinion. 🛡️
