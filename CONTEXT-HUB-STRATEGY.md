# Context Hub Strategy — YNOT.NOW

> Phased plan to turn YNOT.NOW's Context Hub position into a durable competitive advantage.

**Position:** Only insurance AI intelligence provider in Andrew Ng's Context Hub.
**Asset:** 8-agent system producing 27+ verified findings/week, compound signal trajectories, cross-agent agreements.

---

## Phase 1: Visibility & Tracking (NOW — deploy immediately)

**Goal:** Know who's consuming your intelligence and how much.

| What | Status | Where |
|------|--------|-------|
| API usage tracking in `context-hub.js` | Built | Logs every request to `api_usage` Supabase table |
| `api_usage` Supabase table + views | SQL ready | Run `scripts/add_api_usage_table.sql` in Supabase |
| Weekly analytics digest | Scheduled | Cowork task: every Tuesday 9 AM |
| Weekly PR health check | Scheduled | Cowork task: every Monday 10 AM |

**Action required before this works:**
1. Run `scripts/add_api_usage_table.sql` in Supabase SQL Editor
2. Deploy updated `api/context-hub.js` (push to main)
3. Run the two scheduled tasks once manually to pre-approve tool permissions

**What you'll learn:**
- How many agents/developers are pulling your data weekly
- Which insurance domains have the highest demand
- Whether Context Hub CLI (`chub get`) drives meaningful traffic
- Growth trends week-over-week

---

## Phase 2: Competitive Defense (ACTIVE — runs automatically)

**Goal:** Never be surprised by a competitor entering your space.

| What | Status | Where |
|------|--------|-------|
| Bi-monthly Context Hub scan | Scheduled | Cowork task: 1st and 15th of each month, 9 AM |
| Checks new PRs, content contributors, project momentum | Automated | Scans andrewyng/context-hub |
| Monitors YNOT.NOW PR merge velocity | Automated | Flags if PRs are being ignored |

**What to watch for:**
- New `content/` directories from other insurance providers
- Fintech or healthcare contributors (validates the model — good for you)
- Changes to Context Hub's content-guide.md (may require DOC.md format updates)
- Decline in PR merge speed (relationship risk with maintainers)

**Your moat:** vendor-neutral, 25+ weeks of consistent data, multi-agent cross-validation. A vendor entering would be biased. A consultancy entering would be infrequent. Your weekly cadence and neutrality are hard to replicate.

---

## Phase 3: Monetization Path (READY — activate when demand proves out)

**Goal:** Capture value from the intelligence you're giving away.

| What | Status | Where |
|------|--------|-------|
| Pro API endpoint (`/api/context-hub-pro`) | Built, deployed as "coming soon" | Returns teaser response until keys configured |
| Trajectories endpoint | Ready | Full signal trajectory history |
| Raw intelligence endpoint | Ready | Tavily results per agent per run |
| 52-week findings history | Ready | vs. 8 weeks on free tier |
| Platform stats endpoint | Ready | Usage analytics |

**Free vs. Pro split:**

| Capability | Free (Context Hub) | Pro (paid API) |
|-----------|-------------------|----------------|
| Weekly findings | Last 2 weeks | Up to 52 weeks |
| Signal trajectories | Top 10 summary | Full history with weekly snapshots |
| Cross-agent agreements | Top 8 summary | Full dataset with details |
| Raw Tavily sources | Not available | Per-agent, per-run |
| Format | Markdown | JSON (structured) |
| Update frequency | Weekly snapshot | Live (1-hour cache) |

**When to activate:**
- When `api_usage` shows consistent programmatic consumers (not just your own GitHub Action)
- When you see 50+ weekly requests from non-browser sources
- When someone asks "can I get more data?" (inbound signal)

**How to activate:**
1. Generate API keys
2. Set `CONTEXT_HUB_PRO_KEYS` in Vercel env vars (comma-separated)
3. The endpoint automatically switches from "coming soon" to authenticated access

---

## Phase 4: Distribution (FUTURE — when Phases 1-3 prove out)

**Ideas to evaluate based on Phase 1-3 data:**

- **MCP Registry listing** — publish the Context Hub API as an MCP tool so any Claude/agent can pull insurance intelligence natively
- **Claude Plugin** — same data, surfaced inside Claude conversations
- **LinkedIn content from trajectories** — automated "Signal of the Week" posts from your highest compound-score trajectories
- **Carrier partnerships** — white-label the intelligence for specific insurers or consultancies
- **Job posting analysis** — track carrier AI hiring patterns as deployment signals (new data source, big differentiator)
- **Quarterly reviews** — synthesize 3 months of trajectories into strategic narrative arcs (premium content)

---

## Scheduled Tasks Summary

| Task | Schedule | Purpose |
|------|----------|---------|
| `context-hub-weekly-review` | Monday 10 AM | Did the pipeline work? PR created? API healthy? |
| `context-hub-analytics` | Tuesday 9 AM | Who consumed your data this week? Growth trends. |
| `context-hub-competitive-watch` | 1st & 15th, 9 AM | Any new competitors? Context Hub project momentum? |

---

## Deploy Checklist

Before this strategy is live, run these steps in order:

- [ ] Run `scripts/add_api_usage_table.sql` in Supabase SQL Editor
- [ ] Push updated files to main: `api/context-hub.js`, `api/context-hub-pro.js`, `.github/workflows/context-hub-update.yml`, `CONTEXT-HUB-README.md`
- [ ] Run each scheduled task once manually in Cowork to pre-approve tool permissions
- [ ] Verify `/api/context-hub` still returns valid markdown (test locally or hit live endpoint)
- [ ] Verify `/api/context-hub-pro` returns the "coming soon" response

---

*Last updated: 2026-03-30*
