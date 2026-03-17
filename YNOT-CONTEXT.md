# YNOT.NOW — Full Project Context

> **MANDATORY FIRST READ — ALL AGENTS**
> This project is worked on by **Claude Code**, **Claude.ai**, **Manus**, and **Emergent**.
> Read this file before making any changes. After changes, update this file in the same commit if the tech stack, data model, or platform state changed.

**Live URL:** https://ynot-now.vercel.app
**GitHub:** https://github.com/heyshivaai/ynot-now
**Last updated:** 2026-03-09  
**Critical Fix:** Freshness validation system added (4-layer date filtering)

---

## What YNOT.NOW Is

An open-access insurance AI signal intelligence platform. Eight specialist AI "minds" run every Monday, scanning academic papers, regulatory feeds, community signals, and news to surface what's real, what's noise, and what's emerging in AI across the insurance industry.

Every finding is scored, sourced, and free. No subscriptions. No vendor relationships. No hidden agenda. Intelligence as a shared resource.

**Who it's for:**
- Insurance professionals who want a clear, independent view of AI developments
- Technologists evaluating where to invest attention and resources
- Researchers and students building understanding of AI in insurance

---

## The Eight Minds (Multi-Agent Architecture as of 2026-03-09)

**CRITICAL: Atlas/Prism/Deploy have been replaced by Lex/Terra/Horizon. Do not revert.**

The system runs in two phases every Monday. Phase 1 agents run first and autonomously search the web. Phase 2 synthesis agents then read all Phase 1 findings before doing their own targeted search and analysis.

### Phase 1 Agents (06:00 UTC, `api/cron.js`)

| Mind | Icon | Domain | Role | Findings/run |
|------|------|--------|------|--------------|
| **Scout** | 🔭 | P&C | Claims automation, underwriting AI, telematics, fraud detection | 3–6 |
| **Vita** | 🧬 | Life & Annuities | AI underwriting, wearables, longevity modelling, actuarial foundation models | 3–6 |
| **Lex** | ⚖️ | Regulation | FCA, EIOPA, NAIC, EU AI Act, IAIS, model risk governance | 3–6 |
| **Terra** | 🌍 | Climate & ESG | Climate risk AI, parametric insurance, ESG underwriting, cat modelling | 3–6 |
| **Horizon** | 🌐 | Horizontal Tech | Foundation models, agentic AI, synthetic data, federated learning, PQC | 3–6 |

### Phase 2 Synthesis Agents (06:02 UTC, `api/cron-synthesise.js`)

| Mind | Icon | Role | What they do |
|------|------|------|--------------|
| **Null** | ⚔️ | Sceptic | Reads ALL Phase 1 findings, challenges hype, calls out AI washing, detects noise |
| **Weave** | 🕸️ | Systems thinker | Reads ALL Phase 1 findings, finds second-order cross-domain effects |
| **Faro** | 🔦 | Horizon scanner | Reads ALL Phase 1 findings, identifies 18–36 month early signals others missed |

**Total findings per weekly run: ~27–42 (varies by Tavily results quality)**

### How Agents Work (True Multi-Agent — Full Trust Layer)

1. Each Phase 1 agent reads its **domain brief + last 4 weeks of its own findings** (agent memory)
2. Each agent **generates its own 3-4 Tavily search queries** based on its brief and memory
3. Tavily fetches live web results for each query (real-time, no cached corpus)
4. Each agent analyses its own results and produces 3-6 structured findings
5. All `refs` URLs are **HTTP HEAD-checked** — dead links removed, findings with 0 live refs flagged
6. Each finding is assigned a **signal_status**: `NEW`, `EMERGING` (2-3 weeks), `CONFIRMED` (4+), `RECURRING`
7. Phase 2 agents read ALL Phase 1 findings as context, then generate synthesis queries
8. Null and Weave use **Claude extended thinking** (`budget_tokens: 8000`) for deeper reasoning
9. Phase 2 agents search Tavily for additional evidence, then produce cross-agent insights
10. URL verification runs again on Phase 2 findings
11. Phase 2 regenerates the full weekly digest incorporating all 8 agents' work

### Supabase Columns Required for Full Trust Layer
```sql
ALTER TABLE findings ADD COLUMN IF NOT EXISTS signal_status text DEFAULT 'NEW';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS search_queries text[];

-- Freshness validation columns (added 2026-03-09)
ALTER TABLE findings ADD COLUMN IF NOT EXISTS source_published_date date;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_flag text DEFAULT 'undated';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS freshness_priority int DEFAULT 2;
CREATE INDEX IF NOT EXISTS idx_findings_freshness ON findings(freshness_priority, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_findings_source_date ON findings(source_published_date DESC);

CREATE TABLE IF NOT EXISTS source_reputation (
  id bigserial PRIMARY KEY,
  domain text UNIQUE,
  mention_count int DEFAULT 1,
  last_seen date,
  agent_names text[]
);
```

---

## Horizon's Horizontal Tech Focus Areas

Horizon (formerly Prism) covers horizontal enterprise AI technologies with insurance implications:

1. **Agentic AI** — Multi-agent orchestration, LangGraph, AutoGen, CrewAI, agentic RPA
2. **Foundation Models & LLMs** — New releases, fine-tuning for FS/insurance, multimodal
3. **Synthetic Data** — Training data generation, privacy-preserving sharing, regulatory acceptance
4. **Real-Time Decisioning** — Streaming ML inference, event-driven architectures, real-time underwriting/fraud/pricing
5. **Model Risk & AI Governance** — Model cards, EU AI Act compliance, SR 11-7, bias detection, explainability
6. **Post-Quantum Cryptography** — NIST PQC standards, migration timelines, carrier readiness
7. **Federated Learning** — Privacy-preserving ML across carrier consortia, data-sharing regulation

---

## Finding Structure

Every finding has these fields:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Specific, named finding |
| `verdict` | SIGNAL \| WATCH \| NOISE | Evidenced & meaningful \| Worth monitoring \| Overhyped |
| `body` | string | 2–3 sentences with evidence, deployments, numbers |
| `confidence` | 1–5 | How well-evidenced the finding is |
| `domain` | string | P&C \| Life \| Reinsurance \| Horizontal |
| `subdomain` | string | Specific area within domain |
| `experiment` | string | One testable hypothesis to confirm or challenge the finding |
| `trl` | 1–9 | Technology Readiness Level (1–3 Idea, 4–5 Experiment, 6–7 Pilot, 8–9 Proven) |
| `regulatoryRisk` | low \| medium \| high | Regulatory exposure of deploying this |
| `refs` | array of {label, url} | Real, publicly accessible sources only — never placeholder URLs |

### TRL Scale
- **1–3 Idea/Research** — Academic, theoretical, pre-prototype
- **4–5 Experiment** — Proof of concept, lab-tested, early pilots
- **6–7 Pilot** — Live deployments, limited scale
- **8–9 Proven/Standard** — Production at multiple carriers, measurable ROI

---

## Live Data Sources (25+ total)

All sources are free public APIs — no API keys required. Fetched fresh every Monday before minds are called. Each has a 6-second timeout so a slow source never blocks the run.

### arXiv (7 queries)
| Source var | Query focus |
|------------|-------------|
| `arxiv` | Insurance + machine learning |
| `arxivHorizontal` | Agentic AI / LLM enterprise |
| `arxivClimate` | Climate risk / cat / parametric insurance |
| `arxivLife` | Longevity risk / actuarial ML / mortality prediction |
| `arxivSynthetic` | Federated learning / synthetic data + privacy |
| `arxivPqc` | Post-quantum cryptography |
| `arxivEdgeDigital` | Digital twins + edge AI + IoT |
| `arxivDataInfra` | RAG / vector databases / streaming ML |

### Hacker News (3 queries, last 7–14 days)
- General AI/enterprise/insurance stories
- InsurTech / underwriting / claims AI
- PQC / AI governance / model risk

### Academic & Standards
- **OpenAlex** — 250M papers, returns real DOI URLs (`doi.org/...`). Best source for citable specific paper URLs.
- **NIST RSS** — AI standards, PQC progress, cybersecurity publications

### Regulatory & Supervisory
- **FCA RSS** — UK Financial Conduct Authority live news (enforcement, guidance, sandboxes)
- **Federal Register** — US insurance AI regulation filings
- **EIOPA** — European Insurance and Occupational Pensions Authority
- **IAIS** — International Association of Insurance Supervisors (global standards)

### Insurance Industry Research
- **Geneva Association** — Global insurance think tank research
- **Lloyd's of London** — Major reinsurance/specialty market research
- **SOA (Society of Actuaries)** — Actuarial AI research, life/annuities focus
- **CAS (Casualty Actuarial Society)** — P&C actuarial innovation and analytics
- **BIS** — Bank for International Settlements (financial stability, systemic risk)

### Community & Developer
- **GitHub Trending** — Weekly trending repositories
- **Reddit r/insurtech** — Community market signal, new posts
- **dev.to** — Rising AI development articles

### Source routing per mind
| Sources | Minds |
|---------|-------|
| OpenAlex, HN general | All 8 |
| HN insurtech, Federal Register, Reddit | Scout, Deploy, Null, Weave |
| arXiv climate | Atlas |
| arXiv life/longevity | Vita |
| arXiv insurance+ML | Scout, Vita, Atlas, Prism |
| arXiv horizontal (all 5 queries), GitHub, HN security, NIST, dev.to | Prism, Faro |
| FCA RSS, EIOPA, IAIS | Null, Weave, Prism, Atlas |
| Lloyd's | Atlas, Scout, Deploy |
| SOA | Vita, Faro, Prism |
| CAS | Scout, Null, Deploy |
| Geneva Association | Atlas, Weave, Faro |
| BIS | Weave, Prism, Faro |

---

## Tech Stack

### Frontend
- Single `index.html` — all CSS and JS inline, no framework
- Fonts: DM Sans, DM Serif Display, DM Mono (Google Fonts CDN)
- Responsive — hamburger nav on mobile, scrollable filter pills

### Backend (Vercel Serverless)
| File | Purpose |
|------|---------|
| `api/cron.js` | Phase 1 cron — Scout, Vita, Lex, Terra, Horizon each autonomously search Tavily and produce findings |
| `api/cron-synthesise.js` | Phase 2 cron — Null, Weave, Faro read Phase 1 findings, search Tavily, produce synthesis findings + regenerate digest |
| `api/findings.js` | Serves findings to frontend from Supabase cache |
| `api/think.js` | Live Anthropic proxy — fallback if no cached findings |
| `api/pulse.js` | Weekly Pulse — generates a LinkedIn-format executive briefing from the latest run's findings; server-side paginated; returns `spotlight` + `top_findings[]` + `archive`; supports `?force=true` to bypass cache |
| `api/digest.js` | Digest endpoint |
| `api/visitors.js` | Visitor counter |

### Database (Supabase)
| Table | Purpose |
|-------|---------|
| `findings` | All weekly findings — accumulates over time, never deleted |
| `trl_history` | TRL trajectory over time — tracks how each technology matures |
| `weekly_posts` | Weekly Pulse briefings generated by Claude — handle gracefully if table missing |

### AI
- **Model:** `claude-sonnet-4-20250514`
- **Prompt caching:** enabled (`anthropic-beta: prompt-caching-2024-07-31`) — system prompt and each mind's static prompt are cached, dynamic live sources are not
- **Cost:** ~$0.15 per weekly run

### Cron Auth Pattern
Vercel's internal cron scheduler calls `/api/cron` with **no `Authorization` header**. The auth check in `api/cron.js` must only enforce the `Bearer` secret when an `Authorization` header is actually present:
```js
var auth = req.headers['authorization'] || '';
var isExternalCall = auth.length > 0;
if (isExternalCall && auth !== 'Bearer ' + CRON_SECRET) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```
Do **not** revert this to a strict check — it will silently block every automated Monday run.

### Hosting & Deploy
- **Vercel** (primary) — two cron jobs: `0 6 * * 1` (Phase 1) and `2 6 * * 1` (Phase 2)
- **Netlify** (configured as backup) — via `netlify.toml`
- GitHub push to `main` → auto-deploys on Vercel

### Environment Variables (Vercel)
| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Anthropic API access |
| `SUPABASE_URL` | `https://wsplocidlmtfpvzudzdz.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `CRON_SECRET` | `ynot-secret-2025` — authorises cron trigger |
| `TAVILY_API_KEY` | Tavily search API key — required for autonomous agent web search |

---

## Manual Cron Trigger

To trigger a run outside the Monday schedule:
```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```
Takes ~30–60 seconds. Returns `{"success":true,"run_id":"...","findings_count":27,"errors":[]}`.

---

## Current State (as of 2026-03-09)

### What's working well
- **TRUE 4-LAYER FRESHNESS VALIDATION (2026-03-09)** — prevents outdated sources from appearing in weekly briefings
  - Layer 1: Tavily `days: 7` parameter filters at source
  - Layer 2: Agent prompts explicitly reject sources > 7 days old
  - Layer 3: Programmatic validation removes stale refs, assigns freshness priority (1=fresh, 2=undated, 3=stale)
  - Layer 4: Pulse generation prioritizes fresh findings over undated/stale
  - New DB columns: `source_published_date`, `freshness_flag`, `freshness_priority`
  - See `/app/FRESHNESS_VALIDATION.md` for full documentation
- **True multi-agent system** — agents autonomously generate queries, search Tavily, and Phase 2 agents read Phase 1 findings before producing synthesis
- **Agent memory** — each agent receives its last 4 weeks of findings in its brief; signals tracked as NEW/EMERGING/CONFIRMED/RECURRING
- **URL verification** — all refs HTTP HEAD-checked before storing; dead links removed; findings with 0 live refs flagged
- **Extended thinking** — Null and Weave use Claude's extended thinking mode (`budget_tokens: 8000`) for deeper sceptical analysis
- **Signal status tracking** — `signal_status` field on every finding; keyword overlap comparison against prior weeks
- **Source reputation** — high-quality domains tracked in `source_reputation` table for future query seeding
- Atlas/Prism/Deploy replaced by Lex/Terra/Horizon — DO NOT revert
- Tavily API integrated for live autonomous web search (`TAVILY_API_KEY` in Vercel env vars)
- Two-phase cron architecture to stay within Vercel free tier 60s timeout
- 0 fake/placeholder URLs — all refs are real, publicly accessible sources
- **Weekly Pulse** — fully redesigned as of 2026-03-09 (see Weekly Pulse section below)
- **How It Works section** — completely rewritten with two-phase architecture, 6 trust cards, signal status legend, extended thinking badges
- About section updated for boards + exec leadership audience
- GitHub auth: repo owner is `heyshivaai` (heyshiva.ai@gmail.com); Manus uses PAT stored per-session

### Known limitations
- No user accounts, no personalisation, no bookmarking
- No email/Slack digest for weekly findings
- Signal History and Regional Intelligence sections in frontend are stubs
- `trl_history` table populated but not prominently used in UI
- No search or full-text filter across findings
- Agent memory (Emerging/Confirmed/Fading signal trajectory) is logic-layer only — no dedicated Supabase table yet

---

## Agent Output Tone Rules (Global — applies to all 8 agents + pulse + digest)

These rules apply to every agent prompt in `api/cron.js`, `api/cron-synthesise.js`, and `api/pulse.js`. Do not change agent prompts in a way that violates these rules.

### Core principle
YNOT.NOW is an **educational and informational resource**, not an advisory service. All agent output must inform and spark curiosity — not prescribe, recommend, or direct action.

### Field-level rules

| Field | Framing required |
|-------|-----------------|
| `body` | Factual and observational — describe what is found and what is currently understood. No prescriptive or advisory language. |
| `experiment` | A research question or learning hypothesis worth exploring further — frame as curiosity, not a recommendation or action item. |
| Digest hook | Grounded in a real finding; reads as an observation, not a call to action. |
| Digest bullets | "What was found and what it reveals about the state of AI in insurance." Not "what leaders should do." |
| Digest close | Observational — "What is worth watching or learning more about." Not "What leaders should be doing." |
| Pulse post | Same as digest — all copy is educational, grounded, non-advisory. |

### Banned framing in agent output
- "Leaders should..." / "CTOs must..." / "You should..."
- "Act on this" / "Time to act" / "Merits action now"
- "Decision-makers" (when framed as directing decisions)
- "Strategic recommendation" / "We recommend"
- Any language implying the platform is a substitute for professional advice

### Allowed framing
- "Research suggests..." / "Evidence shows..."
- "Worth following as evidence develops"
- "A research question worth exploring..."
- "What is currently understood about..."
- "Reveals how AI in insurance is evolving"

---

## Product Decisions & Principles

- **Open access only** — no paywalled sources, no vendor sponsorship
- **Source attribution always** — every finding links to a real source; refs with unverifiable URLs shown as plain text labels rather than clickable links
- **Honest about readiness** — most horizontal tech is Experiment/Pilot stage in insurance even if Proven elsewhere
- **No subscriptions, no ads** — intelligence as a shared public resource
- **Static frontend** — no React, no build step, no npm dependencies

---

---

## Weekly Pulse — Design & Technical Spec (locked 2026-03-09)

### Purpose
The Weekly Pulse is the primary content surface. It serves two audiences simultaneously:
1. **Website visitors** — scannable, structured, visually clear
2. **LinkedIn** — the same post is copy-ready for LinkedIn with one click

### Post Format (enforced in `pulse.js` prompt — do not change without updating this doc)

The briefing must follow this exact structure, with each section on its own line:

```
[Hook — one specific, slightly provocative sentence from a real finding. No generic openers.]

[Agent summary — "N agents scanned the market this week and delivered X findings — Y Signals, Z Watch, W Noise — with [dominant theme] dominating across [domains]."]

→ [Finding Title] — [one sharp sentence: what + why it matters]
→ [Finding Title] — [one sharp sentence]
→ [Finding Title] — [one sharp sentence]

[Close — one observational sentence. What is worth watching or learning more about. No clichés. No "game-changer", "landscape", "transformative", "leverage".]

All findings this week → ynot.now

#InsurTech #AIinInsurance #Insurance #Innovation
```

**Banned words in the prompt:** leverage, landscape, transformative, game-changer, revolutionize, unprecedented, cutting-edge, robust, seamless, unlock, empower, harness, synergy, paradigm.

### Visual Rendering (enforced in `index.html` — do not flatten back to plain text)

The `renderPulseText(text, isSpotlight, topFindings)` function parses the post into distinct visual sections:

| Section | CSS class | Visual treatment |
|---|---|---|
| Hook | `.ps-hook` | 17px bold serif, high contrast |
| Agent summary | `.ps-summary` | Monospace pill on off-white background |
| Bullets | `.ps-bullets` | Bordered card list, `→` arrow, bold title + plain body |
| Learn more button | `.ps-learn-btn` | Small pill button; toggled per bullet |
| Finding drawer | `.ps-finding-drawer` | Inline expandable; shows verdict badge, domain, TRL, full body, source refs |
| Close | `.ps-close` | 14px italic |
| Attribution | `.ps-attribution` | Monospace, `ynot.now` hyperlinked |
| Hashtags | `.ps-hashtags` | Monospace, muted |

The footer has a top border separator and a **"Copy for LinkedIn"** button that copies the original plain text (not the rendered HTML).

### Expandable Finding Drawers

Each bullet is fuzzy-matched to a finding from `top_findings[]` using keyword overlap (≥40% threshold). Matched bullets get a **"Learn more"** toggle that reveals:
- Verdict badge (SIGNAL/WATCH/NOISE with colour coding)
- Domain · Subdomain
- TRL level
- Full `body` text
- Up to 3 source refs as clickable links

The `pulse.js` API returns `top_findings[]` (top 5 SIGNAL/WATCH findings by confidence) alongside the spotlight post on every `section=all` or `section=spotlight` request.

### API Pagination

`/api/pulse` supports server-side pagination — the browser never loads more than one page of archive posts at a time:

| Param | Default | Purpose |
|---|---|---|
| `section` | `all` | `all` \| `spotlight` \| `archive` |
| `page` | `0` | Zero-indexed archive page |
| `limit` | `5` | Posts per page (max 20) |
| `force` | `false` | Set `true` to bypass `weekly_posts` cache and regenerate |

The `weekly_posts` table caches generated posts. The fallback (when table is empty) queries `findings` ordered by `created_at desc` to always pick the most recent run.

### Date Labels

All dates shown to users are snapped to the **Monday of the ISO week** using `toMondayDate()` — a Saturday dev run and a Monday prod run in the same week show the same label. Never display raw `run_date` directly.

### Supabase Schema Note
The `weekly_posts` table should have a `linkedin_post` column for future use:
```sql
ALTER TABLE weekly_posts ADD COLUMN IF NOT EXISTS linkedin_post text;
```

---

## Open Questions / Potential Next Steps

- Email digest: weekly summary of top signals delivered to subscribers
- Regional intelligence layer: EU vs US vs APAC regulatory divergence
- Comparison view: how has a specific technology's TRL changed over weeks?
- Could Null become more targeted — e.g. debunking a specific vendor claim each week?
- Should findings link to a permanent URL (e.g. `/findings/run_id/slug`) for sharing?
- Should the platform eventually accept community-submitted signals for human editorial review?
- Add a dedicated `agent_memory` Supabase table for proper signal trajectory tracking (Emerging/Confirmed/Fading)
- Upgrade to Vercel Pro to remove 60s function timeout and consolidate back to a single cron job
- Add inter-agent communication: let Phase 2 agents ask Phase 1 agents follow-up questions
