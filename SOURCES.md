# YNOT.NOW Open-Access Sources

This file tracks all open-access sources used by the YNOT.NOW multi-agent system. 
Add new sources here to ensure they are included in the website and agent searches.

Last updated: 2026-03-12

---

## Academic & Research

| Source | URL | Description |
|--------|-----|-------------|
| arXiv | https://arxiv.org | Pre-print research papers |
| OpenAlex | https://openalex.org | Open catalog of scholarly works |
| SSRN | https://www.ssrn.com | Social Science Research Network |

## Regulatory Bodies

| Source | URL | Region | Description |
|--------|-----|--------|-------------|
| NAIC | https://content.naic.org | US | National Association of Insurance Commissioners |
| Federal Register | https://www.federalregister.gov | US | US government regulations |
| FCA | https://www.fca.org.uk | UK | Financial Conduct Authority |
| PRA | https://www.bankofengland.co.uk/prudential-regulation | UK | Prudential Regulation Authority |
| EIOPA | https://www.eiopa.europa.eu | EU | European Insurance and Occupational Pensions Authority |
| APRA | https://www.apra.gov.au | Australia | Australian Prudential Regulation Authority |
| MAS | https://www.mas.gov.sg | Singapore | Monetary Authority of Singapore |
| IAIS | https://www.iaisweb.org | Global | International Association of Insurance Supervisors |

## Standards & Policy

| Source | URL | Description |
|--------|-----|-------------|
| NIST | https://www.nist.gov | National Institute of Standards and Technology |
| BIS | https://www.bis.org | Bank for International Settlements |
| ACORD | https://www.acord.org | Insurance data standards organization |

## Insurance Industry Research

| Source | URL | Description |
|--------|-----|-------------|
| Geneva Association | https://www.genevaassociation.org | Global insurance think tank |
| Lloyd's of London | https://www.lloyds.com | Lloyd's market insights |
| SOA | https://www.soa.org | Society of Actuaries |
| CAS | https://www.casact.org | Casualty Actuarial Society |
| AM Best | https://www.ambest.com | Insurance ratings and research |

## Community & Developer

| Source | URL | Description |
|--------|-----|-------------|
| Hacker News | https://news.ycombinator.com | Tech community news |
| GitHub Trending | https://github.com/trending | Trending repositories |
| dev.to | https://dev.to | Developer community |
| r/insurtech | https://www.reddit.com/r/insurtech | InsurTech subreddit |

---

## Sources to Add (Backlog)

| Source | URL | Category | Priority |
|--------|-----|----------|----------|
| ACORD | https://www.acord.org | Industry Standards | High |
| AM Best | https://www.ambest.com | Ratings & Research | High |
| Insurance Journal | https://www.insurancejournal.com | News | Medium |
| Reinsurance News | https://www.reinsurancene.ws | News | Medium |
| Coverager | https://coverager.com | InsurTech News | Medium |
| APRA | https://www.apra.gov.au | Regulatory (APAC) | High |
| MAS | https://www.mas.gov.sg | Regulatory (Singapore) | High |
| CBIRC | http://www.cbirc.gov.cn | Regulatory (China) | Medium |
| PRA | https://www.bankofengland.co.uk/prudential-regulation | Regulatory (UK) | High |
| SSRN | https://www.ssrn.com | Academic | Medium |
| The Actuary | https://www.theactuary.com | Industry Publication | Low |

---

## How to Add a New Source

1. Add the source to the appropriate category table above
2. Update `/index.html` in the `sources-grid` div (search for "sources-grid")
3. If the source should be used by agents, update the agent briefs in `/api/`
4. Commit with message: `feat(sources): add [SOURCE_NAME] to open-access sources`

---

## Source Criteria

Sources must be:
- **Open-access** - No paywall or subscription required for basic access
- **Authoritative** - Official bodies, peer-reviewed, or established community
- **Relevant** - Insurance, AI/ML, regulatory, or technology focused
- **Active** - Regularly updated (at least quarterly)
