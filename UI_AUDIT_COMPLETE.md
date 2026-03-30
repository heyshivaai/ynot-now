# ✅ COMPLETE UI AUDIT: NOISE → UNVERIFIED

**Audit Date:** 2026-03-09  
**Status:** ALL INSTANCES UPDATED

---

## 📋 COMPREHENSIVE CHECKLIST

### **✅ UPDATED - User-Facing Text**

- [x] **Meta tags** - All descriptions say "Signal, Watch, or Unverified"
- [x] **Hero section** - "Signal, Watch, or Unverified — always with evidence"
- [x] **Filter buttons** - "Unverified" button (not "Noise")
- [x] **Verdict legend** - "Unverified: Cannot independently confirm"
- [x] **Stats section** - "Unverified flagged" (not "Noise called out")
- [x] **Agent quotes** - "it's Unverified" (not "calling it Noise")
- [x] **Null description** - "verification analyst" (not "noise detector")
- [x] **Disclaimer** - "Verdicts (Signal, Watch, Unverified)"
- [x] **Example findings** - Blockchain finding says "UNVERIFIED"

### **✅ UPDATED - CSS Styling**

- [x] `.vl-badge.unverified` - Gray badge styling
- [x] `.rl-finding-verdict.unverified` - Gray verdict badge
- [x] `.pv-unverified` - Pulse verdict styling
- [x] `.vl-badge.noise` - Legacy support (same as unverified)
- [x] `.rl-finding-verdict.noise` - Legacy support
- [x] `.pv-noise` - Legacy support

### **✅ UPDATED - JavaScript Functions**

- [x] `normalizeVerdict()` - NEW function converts NOISE → UNVERIFIED
- [x] `makeCard()` - Uses normalizeVerdict()
- [x] `openModal()` - Uses normalizeVerdict()
- [x] `updateRegionalLive()` - Uses normalizeVerdict() for recent findings
- [x] `renderPulseText()` - Uses normalizeVerdict() for search results
- [x] `updateStats()` - Counts UNVERIFIED + legacy NOISE together

### **✅ CORRECT - Not Changed (OK to keep)**

- [x] `id="cbNoise"` - Internal ID (not user-visible, OK to keep)
- [x] "No noise." - Marketing copy meaning "no clutter" (not verdict)
- [x] Code comments with "NOISE" - Technical documentation

---

## 🔍 WHERE "NOISE" STILL APPEARS (ALL INTENTIONAL)

### **Backend Compatibility Code:**
```javascript
// Line 1615 - Normalization function
if(upper==='NOISE')return 'UNVERIFIED';

// Line 1625 - Class assignment for legacy data
const cs=v==='SIGNAL'?'cs':(v==='NOISE'||v==='UNVERIFIED')?'cn':'';

// Line 1736 - Stats counting
const unverified=insights.filter(f=>f.verdict==='UNVERIFIED'||f.verdict==='NOISE').length;
```

**Why:** Database still has old `verdict='NOISE'` records. Code handles both.

### **CSS Legacy Support:**
```css
/* Line 698, 734, 369 - Legacy class support */
.vl-badge.noise{background:#f3f4f6;color:#6b7280;}
.rl-finding-verdict.noise{background:#f3f4f6;color:#6b7280;}
.pv-noise{background:#f5f5f3;color:#999;}
```

**Why:** If old data has `verdict='NOISE'`, CSS still works (displays as gray like UNVERIFIED).

### **Marketing Copy:**
```html
<h2>Weekly findings.<br><em>No noise.</em></h2>
```

**Why:** "No noise" = "no clutter/fluff", not the verdict category. This is marketing language.

---

## ✅ VERIFICATION COMMANDS

### **1. Check All User-Visible Text:**
```bash
grep -i "noise" /app/index.html | grep -v "Legacy\|cbNoise\|\.noise{\|No noise\.\|if(upper\|filter(f=>"
```

**Expected output:** Only backend compatibility code (shown above)

### **2. Check Filter Buttons:**
```bash
grep "setVerd" /app/index.html | grep "pill"
```

**Expected output:** Buttons say "Signal", "Watch", "Unverified"

### **3. Check Verdict Legend:**
```bash
grep -A1 "vl-badge" /app/index.html | grep -E "Signal|Watch|Unverified"
```

**Expected output:** 
- Signal: Evidenced & meaningful
- Watch: Early but credible  
- Unverified: Cannot independently confirm

---

## 🎯 WHAT USERS SEE

### **Before Fix:**
- Filter: [All verdicts] [Signal] [Watch] **[Noise]** ❌
- Legend: Signal | Watch | **Noise: Narrative over substance** ❌
- Stats: **"15 Noise called out"** ❌
- Badges: Red **"NOISE"** badge ❌

### **After Fix:**
- Filter: [All verdicts] [Signal] [Watch] **[Unverified]** ✅
- Legend: Signal | Watch | **Unverified: Cannot independently confirm** ✅
- Stats: **"15 Unverified flagged"** ✅
- Badges: Gray **"UNVERIFIED"** badge ✅

---

## 📊 DISPLAY LOGIC FLOW

```
Database
  ↓
verdict='NOISE'
  ↓
API returns: {verdict: 'NOISE'}
  ↓
Frontend JavaScript
  ↓
normalizeVerdict('NOISE')
  ↓
Returns: 'UNVERIFIED'
  ↓
Display: "UNVERIFIED" badge (gray)
```

---

## ✅ AUDIT COMPLETE

**Summary:**
- ✅ ALL user-facing text updated
- ✅ ALL buttons/filters updated
- ✅ ALL CSS classes updated (+ legacy support)
- ✅ ALL JavaScript functions updated
- ✅ Example data updated
- ✅ Meta tags updated
- ✅ Marketing copy checked (intentionally different)

**Remaining "NOISE" references:**
- Backend compatibility code (intentional)
- CSS legacy support (intentional)
- Internal IDs (not user-visible)
- Marketing copy "No noise" (different meaning)

**Result:** Frontend is 100% "NOISE"-free from user perspective! 🎉
