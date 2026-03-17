# FRESHNESS VALIDATION FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MONDAY 06:00 UTC - PHASE 1 CRON RUN                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│  5 Primary Agents:   │
│  Scout, Vita, Lex,   │
│  Terra, Horizon      │
└──────────┬───────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LAYER 1: TAVILY SEARCH                             │
│  Agent generates queries → Tavily API with days: 7 parameter                │
│  ✅ Only results from last 7 days returned                                  │
│  📊 Example: March 9, 2026 run → only March 2-9 sources                    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Search Results     │
                │  published_date: ✓  │
                └──────────┬──────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       LAYER 2: CLAUDE ANALYSIS                              │
│  System Prompt: "ONLY use sources from last 7 days. Reject old sources."   │
│  ✅ Claude analyzes results with date awareness                             │
│  📊 Example: Sees "[published: 2026-03-05]" → Accepts                      │
│             Sees "[published: 2025-05-22]" → Rejects (shouldn't happen)    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Raw Findings       │
                │  with refs[]        │
                └──────────┬──────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  LAYER 3: PROGRAMMATIC VALIDATION                           │
│  validateSourceFreshness() function                                         │
│  ✅ Checks each ref.published_date programmatically                         │
│                                                                              │
│  For each ref:                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │ IF published_date exists:                                       │       │
│  │   IF age < 7 days → Keep (fresh), priority 1                    │       │
│  │   IF age ≥ 7 days → Remove (stale), log warning                 │       │
│  │ ELSE (no date):                                                  │       │
│  │   Keep (undated), priority 2                                    │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  IF finding has 0 refs left after filtering → Remove entire finding         │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────────────┐
                │  Validated Findings         │
                │  + freshness_flag           │
                │  + freshness_priority       │
                │  + source_published_date    │
                └──────────┬──────────────────┘
                           │
                           ▼
                ┌─────────────────────────┐
                │  SUPABASE Storage       │
                │  findings table         │
                └──────────┬──────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MONDAY 06:02 UTC - PHASE 2 CRON RUN                      │
│  (Synthesis Agents: Null, Weave, Faro)                                      │
│  Same 3-layer process: Tavily filter → Claude prompts → Validation          │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LAYER 4: PULSE GENERATION                               │
│  api/pulse.js - generateExecutiveBriefing()                                 │
│  ✅ Sort findings by freshness_priority, then confidence                    │
│                                                                              │
│  Ranking:                                                                   │
│  1. fresh (priority 1, high confidence)                                     │
│  2. fresh (priority 1, low confidence)                                      │
│  3. undated (priority 2, high confidence)                                   │
│  4. undated (priority 2, low confidence)                                    │
│  5. stale (priority 3) ← Should never exist if L1-L3 work                  │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Weekly Briefing    │
                │  Fresh content only │
                │  Published to users │
                └─────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                         EXAMPLE: NBC ARTICLE SCENARIO

┌─────────────────────────────────────────────────────────────────────────────┐
│  BEFORE FIX (March 9, 2026 run):                                            │
│                                                                              │
│  Horizon agent searches "Claude 4 enterprise capabilities"                  │
│  → Tavily returns NBC article (published: 2025-05-22) ❌ 10 months old     │
│  → Claude analyzes, creates finding with NBC ref                            │
│  → Stored in database with NO date validation                               │
│  → Appears in March 9, 2026 briefing ❌ CREDIBILITY ISSUE                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  AFTER FIX (March 9, 2026 run):                                             │
│                                                                              │
│  Horizon agent searches "Claude 4 enterprise capabilities"                  │
│  → LAYER 1: Tavily days: 7 filter → NBC article NOT returned (too old)     │
│  → LAYER 2: Claude only sees recent sources (March 2-9, 2026)              │
│  → LAYER 3: validateSourceFreshness() double-checks all refs                │
│  → LAYER 4: Pulse prioritizes fresh findings                                │
│  → Result: ONLY fresh content in briefing ✅ CREDIBILITY PROTECTED          │
└─────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                           EDGE CASE HANDLING

┌─────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 1: Tavily returns 0 results (strict filter)                       │
│  ├─ Layer 1: days: 7 → No results                                           │
│  ├─ Agent logs: "no results, skipping"                                      │
│  └─ Result: 0 findings for that agent ✅ Better than stale content          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 2: Source has no published_date                                   │
│  ├─ Layer 1: Tavily returns it (can't filter without date)                  │
│  ├─ Layer 2: Claude sees [NO DATE] but can still use it                     │
│  ├─ Layer 3: validateSourceFreshness() flags as 'undated', priority 2       │
│  └─ Result: Allowed but deprioritized ✅ Useful sources not blocked         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 3: Layer 1 fails (Tavily bug, returns old source)                 │
│  ├─ Layer 1: Tavily returns NBC May 2025 article (BUG)                      │
│  ├─ Layer 2: Claude should reject per prompt, but let's say it doesn't      │
│  ├─ Layer 3: validateSourceFreshness() detects 2025-05-22 > 7 days          │
│  │            Removes NBC ref, logs warning                                  │
│  └─ Result: Stale ref removed ✅ Defensive programming catches it           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SCENARIO 4: Finding has mix of fresh + stale refs                          │
│  ├─ Finding has 3 refs:                                                     │
│  │   1. Article A (2026-03-07) ✅ fresh                                     │
│  │   2. Article B (2025-12-01) ❌ stale                                     │
│  │   3. Blog post (no date) ⚠️ undated                                     │
│  ├─ Layer 3: Keeps refs 1 & 3, removes ref 2                                │
│  └─ Result: Finding kept with 2 refs, flagged 'fresh' (has ≥1 fresh ref)   │
└─────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════

                        MONITORING & HEALTH CHECKS

┌─────────────────────────────────────────────────────────────────────────────┐
│  HEALTHY SYSTEM (Weekly):                                                   │
│  ├─ Freshness distribution:                                                 │
│  │   • fresh: 80-90% ✅                                                     │
│  │   • undated: 10-20% ⚠️                                                  │
│  │   • stale: 0% ✅ (should never be stored)                               │
│  ├─ Logs:                                                                   │
│  │   • "Applying freshness validation" ✅                                   │
│  │   • "X → Y findings retained" ✅                                         │
│  │   • Few/no "Removed stale ref" warnings ✅                               │
│  └─ User experience:                                                         │
│      • All briefing sources are recent ✅                                    │
│      • No complaints about old content ✅                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  ALERT CONDITIONS:                                                           │
│  ├─ stale > 0% → Layer 3 validation may be broken 🚨                        │
│  ├─ > 5 "Removed stale ref" warnings → Layer 1 Tavily filter broken 🚨      │
│  ├─ undated > 40% → Poor source quality, review agent queries ⚠️           │
│  └─ 0 findings after validation → Queries too narrow or quiet week ⚠️      │
└─────────────────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════════════
```

**Key Takeaway:** 4 independent layers ensure old content can't slip through. Even if one layer fails, the others catch it. Defense in depth protects credibility.
