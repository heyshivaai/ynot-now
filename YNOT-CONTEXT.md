# YNOT.NOW — Full Project Context

> **MANDATORY FIRST READ — ALL AGENTS**
> This project is worked on by **Claude Code**, **Claude.ai**, **Manus**, and **Emergent**.
> Read this file before making any changes. After changes, update this file in the same commit if the tech stack, data model, or platform state changed.

**Live URL:** https://ynot-now.vercel.app
**GitHub:** https://github.com/heyshivaai/ynot-now
**Last updated:** 2026-03-09

---

## What YNOT.NOW Is

An open-access insurance AI signal intelligence platform. Eight specialist AI "minds" run every Monday, scanning academic papers, regulatory feeds, community signals, and news to surface what's real, what's noise, and what's emerging in AI across the insurance industry.

Every finding is scored, sourced, and free. No subscriptions. No vendor relationships. No hidden agenda. Intelligence as a shared resource.

**Who it's for:**
- Insurance professionals who want a clear, independent view of AI developments
- Technologists evaluating where to invest attention and resources
- Researchers and students building understanding of AI in insurance

---

## The Eight Minds

Each mind runs weekly via a single Vercel Cron job (`api/cron.js`). They run in parallel via `Promise.allSettled`. Each returns a JSON array of findings.

| Mind | Icon | Domain | What it scans | Findings/run |
|------|------|--------|---------------|-------------|
| **Scout** | 🔭 | P&C | Agentic claims, CV damage assessment, telematics+LLM pricing, fraud GNNs, NLP submission intake, digital twin property risk | 3 |
| **Vita** | 🧬 | Life & Annuities | AI accelerated underwriting, wearable risk scoring, continuous underwriting, longevity modelling, mental health risk AI, actuarial foundation models | 3 |
| **Atlas** | 🌍 | Reinsurance | ML cat models, satellite imagery, parametric trigger AI, climate projections, synthetic cat data, treaty language NLP | 3 |
| **Prism** | 💎 | Horizontal Tech | 12 enterprise tech categories (see below) — finds the global shift, then the insurance implication | **6** |
| **Null** | ⚔️ | All | Overhyped claims, thin evidence, deployments that haven't matched expectations — the noise detector | 3 |
| **Weave** | 🕸️ | All | Second and third-order effects: systemic shifts, workforce bifurcation, distribution economics, regulatory ripples | 3 |
| **Deploy** | 🚀 | All | Proven at scale today — in production at multiple carriers, ROI under 18 months, works with legacy systems | 3 |
| **Faro** | 🔦 | All | 18–36 month horizon signals — genuine early indicators, not speculation | 3 |

**Total findings per weekly run: 27**

---

## Prism's 12 Horizontal Tech Categories

Prism is the most complex mind — it covers all of enterprise IT and finds insurance implications. It returns 6 findings per run covering at least 5 different categories.

1. **AI-Assisted Development** — Vibe coding, Cursor, Copilot, Windsurf, prompt-to-app
2. **Agentic AI** — Multi-agent orchestration, LangGraph, AutoGen, CrewAI, agentic RPA
3. **Foundation Models & LLMs** — New releases, fine-tuning for FS/insurance, multimodal
4. **Copilot-in-Everything** — Microsoft 365 Copilot, Salesforce Einstein, ServiceNow AI, SAP AI
5. **Synthetic Data** — Training data generation, privacy-preserving sharing, regulatory acceptance
6. **Real-Time Decisioning** — Streaming ML inference, event-driven architectures, real-time underwriting/fraud/pricing
7. **Model Risk & AI Governance** — Model cards, EU AI Act compliance, SR 11-7, bias detection, explainability
8. **Data Infrastructure** — Vector DBs, RAG architectures, knowledge graphs, data mesh, lakehouse
9. **Post-Quantum Cryptography** — NIST PQC standards, migration timelines, carrier readiness
10. **Digital Twins & Simulation** — Risk modelling twins, cat simulation, actuarial scenario modelling
11. **Federated Learning** — Privacy-preserving ML across carrier consortia, data-sharing regulation
12. **Edge AI & IoT Intelligence** — Telematics, smart building sensors, wearables, connected vehicle data

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
| `api/cron.js` | Weekly cron — calls all 8 minds, stores findings to Supabase |
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
- **Vercel** (primary) — cron via `vercel.json` schedule `0 6 * * 1` (Monday 6am UTC)
- **Netlify** (configured as backup) — via `netlify.toml`
- GitHub push to `main` → auto-deploys on Vercel

### Environment Variables (Vercel)
| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Anthropic API access |
| `SUPABASE_URL` | `https://wsplocidlmtfpvzudzdz.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `CRON_SECRET` | `ynot-secret-2025` — authorises cron trigger |

---

## Manual Cron Trigger

To trigger a run outside the Monday schedule:
```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```
Takes ~30–60 seconds. Returns `{"success":true,"run_id":"...","findings_count":27,"errors":[]}`.

---

## Current State (as of 2026-03-06)

### What's working well
- 27 findings per run across all 8 minds
- 0 fake/placeholder URLs — all refs are real, publicly accessible sources
- Prompt caching enabled — reduces cost on parallel calls
- Prism covers 6 different horizontal tech categories per run (was 3)
- 18 live data sources feeding into minds before analysis
- Run history preserved — `BASE_RUN_COUNT = 5` in `findings.js` accounts for runs deleted during initial setup
- **Weekly Pulse** — fully redesigned as of 2026-03-09 (see Weekly Pulse section below)
- About section updated for boards + exec leadership audience
- GitHub auth: repo owner is `heyshivaai` (heyshiva.ai@gmail.com); Manus uses PAT stored per-session

### Known limitations
- Scout, Vita, Atlas, Null, Weave, Deploy, Faro still return only 3 findings each — could be increased
- No user accounts, no personalisation, no bookmarking
- No email/Slack digest for weekly findings
- Signal History and Regional Intelligence sections in frontend are stubs
- `trl_history` table populated but not prominently used in UI
- No search or full-text filter across findings

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

[Close — one forward-looking sentence. No clichés. No "game-changer", "landscape", "transformative", "leverage".]

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

- Should Scout, Vita, Atlas also be increased from 3 → 6 findings?
- Email digest: weekly summary of top signals delivered to subscribers
- Regional intelligence layer: EU vs US vs APAC regulatory divergence
- Comparison view: how has a specific technology's TRL changed over weeks?
- Could Null become more targeted — e.g. debunking a specific vendor claim each week?
- Should findings link to a permanent URL (e.g. `/findings/run_id/slug`) for sharing?
- arXiv queries return paper titles but not abstracts — adding summaries would improve AI citation quality
- Should the platform eventually accept community-submitted signals for human editorial review?
