# CLAUDE.md — ynot-now

> **MANDATORY FIRST READ — ALL AGENTS**
> This project is worked on by **Claude Code**, **Claude.ai**, **Manus**, and **Emergent**.
> If you are any AI agent starting a session on ynot-now, read this file first, then `YNOT-CONTEXT.md`.
> Run `git pull` before making changes. Update `YNOT-CONTEXT.md` in the same commit if the tech stack, data model, or platform state changed.

Live at **https://ynot-now.vercel.app** · Repo: github.com/heyshivaai/ynot-now

---

## Deploy

```bash
# From the ynot-now/ directory:
git add <specific files>   # NEVER use git add . or git add -A
git add YNOT-CONTEXT.md    # if you changed something documented there
git commit -m "type: what changed"
git push                   # Vercel auto-deploys in ~30 seconds
```

**Commit types:** `feat` | `fix` | `update` | `refactor` | `data` | `copy`

---

## Tech Stack (Locked — Never Change Without Instruction)

- Frontend: single `index.html` — all CSS and JS inline, no framework, no build step
- Backend: Vercel Serverless functions in `api/`
- Database: Supabase
- AI: Anthropic API, model `claude-sonnet-4-20250514`
- No React, Vue, Tailwind, Bootstrap, or npm frontend dependencies

**Fonts (Google Fonts CDN — these three only):**

| Font | Role |
|------|------|
| DM Sans | Body text, UI copy |
| DM Serif Display | Headings, hero, display |
| DM Mono | Labels, tags, metadata, code |

---

## API Endpoints

| File | Route | Purpose |
|------|-------|---------|
| `api/cron.js` | `/api/cron` | Weekly Vercel Cron — calls all 8 minds, stores to Supabase. Auth: `Authorization: Bearer <CRON_SECRET>` |
| `api/findings.js` | `/api/findings` | Serves cached findings + signal_trajectories + cross_agreements from Supabase |
| `api/think.js` | `/api/think` | Live Anthropic proxy — fallback if no cached findings |
| `api/pulse.js` | `/api/pulse` | Weekly Pulse — Claude executive briefing (120–150 words) for latest run(s) |
| `api/digest.js` | `/api/digest` | Digest endpoint |
| `api/month-review.js` | `/api/month-review` | Monthly narrative synthesis from 4 weeks of findings + trajectories |
| `api/visitors.js` | `/api/visitors` | Visitor counter |
| `api/agent-performance.js` | `/api/agent-performance` | Per-mind performance metrics + leaderboard. Query: `?mind=scout`, `?compare=true` |

---

## Supabase Tables

| Table | Purpose | Notes |
|-------|---------|-------|
| `findings` | All weekly AI findings | Accumulates — never delete rows. Includes `regions` array |
| `trl_history` | TRL trajectory per technology | JS variable name is `trajectory` |
| `weekly_posts` | Weekly Pulse briefings | Handle gracefully if missing — don't crash |
| `signal_trajectories` | Compound signal tracking across weeks | Keyed by `topic_key` (unique). Has compound_score, trl_velocity |
| `intelligence_raw` | Raw Tavily results per agent per run | Enables re-analysis and source tracking |
| `cross_agent_agreements` | Cross-agent topic agreement | When 2+ agents surface same topic |
| `monthly_reviews` | Cached monthly narrative reviews | Keyed by `month_key` (e.g. "2026-03") |
| `run_metrics` | Agent performance baselines per run | Migration: `scripts/add_run_metrics_table.sql` |
| `agent_metrics` | Per-mind performance over time | Migration: `scripts/add_agent_metrics_table.sql` |

---

## Environment Variables (Vercel)

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Anthropic API access |
| `SUPABASE_URL` | `https://wsplocidlmtfpvzudzdz.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `CRON_SECRET` | `ynot-secret-2025` — authorises manual cron trigger |

---

## The Eight Minds

| Mind | Domain | Findings/run |
|------|--------|-------------|
| Scout | P&C | 3 |
| Vita | Life & Annuities | 3 |
| Atlas | Reinsurance | 3 |
| Prism | Horizontal Tech (12 categories) | 6 |
| Null | All — noise detector | 3 |
| Weave | All — second/third-order effects | 3 |
| Deploy | All — proven at scale | 3 |
| Faro | All — 18–36 month horizon | 3 |

**Total: 27 findings per weekly run**

---

## Finding Fields

`title` · `verdict` (SIGNAL|WATCH|UNVERIFIED) · `body` · `confidence` (1–5) · `domain` · `subdomain` · `experiment` · `trl` (1–9) · `regulatoryRisk` (low|medium|high) · `refs` (array of `{label, url}`) · `regions` (array: US|EU|UK|APAC|Global)

---

## Manual Cron Trigger

```bash
curl -X GET https://ynot-now.vercel.app/api/cron \
  -H "Authorization: Bearer ynot-secret-2025"
```

Takes ~30–60 seconds. Returns `{"success":true,"run_id":"...","findings_count":27,"errors":[]}`.

---

## Locked Decisions

- No paywalled sources, no vendor sponsorship — open access only
- Every finding must link to a real, publicly accessible source
- No subscriptions, no ads
- Static frontend — no React, no build step, no npm dependencies
- `BASE_RUN_COUNT = 5` in `findings.js` — accounts for runs deleted during initial setup, do not change without understanding the impact

---

## Project Structure (Atomic Decomposition)

Shared logic lives in `/lib/` — API handlers in `/api/` are thin orchestrators.

| Directory | Purpose |
|-----------|---------|
| `lib/services/` | External API clients: `supabase.js`, `anthropic.js`, `tavily.js` |
| `lib/utils/` | Pure functions: `normalizers.js`, `vendor-filter.js`, `url-utils.js`, `freshness.js` |
| `lib/agents/` | Agent definitions, signal tracking, prompt templates |
| `lib/errors/` | Structured logging (`logger.js`) and error handler |
| `lib/metrics/` | Baseline management (`baseline.js`) — performance tracking |
| `tests/` | Vitest test suite — run with `npm test` |

**Rule:** Never duplicate logic between `cron.js` and `cron-synthesise.js`. If both files need a function, it belongs in `/lib/`.

---

## Testing

```bash
npm test           # Run all tests (vitest)
npm run test:watch # Watch mode
```

Tests cover: normalizers, vendor filter, URL utils, freshness validation, baseline metrics, structured logger.

---

## Ambiguity Rule

If an instruction is ambiguous — stop and ask one clarifying question before writing any code. If context files conflict with the session prompt, flag the conflict.

---

## Context File Sync

After making changes, update `YNOT-CONTEXT.md` if you:

| Changed | Update |
|---------|--------|
| Added/changed an API endpoint | Tech Stack → Backend table |
| Added a Supabase table | Database table |
| Changed mind output count or structure | The Eight Minds section |
| Changed frontend fonts/colours | Tech Stack → Frontend |
| Changed current platform state | Current State section |

---

*Last updated: 2026-04-03*
