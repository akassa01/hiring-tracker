# The Hiring Tracker

The Hiring Tracker shows which a16z and speedrun portfolio companies are actively
hiring, how fast, and which job posts have sat open for months. It's the
counterpart to the speedrun layoffs tracker.

This is an independent prototype for a speedrun Product Engineer application.
It isn't an official a16z or speedrun product.

## How it works

1. `scripts/discover.mjs` lists portfolio companies from the speedrun talent
   network board and finds each company's applicant tracking system (ATS) from
   one job's apply link. It writes `data/companies.json`. Run it once, or when
   the portfolio changes.
2. `scripts/snapshot.mjs` reads every company's open roles from the public
   Ashby, Greenhouse, and Lever posting APIs. For speedrun companies that use
   another system, it reads their listings from the talent network board. It
   writes a dated file to `data/snapshots/`.
3. `scripts/backfill.mjs` reads Wayback Machine copies of the largest job
   boards, one per month for the last 12 months, and writes
   `data/backfill.json`.
4. `scripts/metrics.mjs` turns postings, snapshots, and archive points into
   per-company signals and writes `data/tracker.json`.
5. The Next.js page in `app/` renders `data/tracker.json` as a static page.

A GitHub Actions workflow runs steps 2 and 4 every day and commits the result.
The commit history is the audit trail for every number on the page.

## Signals

| Signal | Rule |
|---|---|
| Hiring fast | 5 or more roles posted in the last 30 days, and at least 30% of open roles are new |
| Steady | New roles are going up at a normal pace |
| Quiet | Roles are open, but none went up in the last 30 days |
| Stale listings | 5 or more open roles, and at least 60% have been open longer than 90 days |

## Run it locally

```bash
npm install
```

```bash
npm run snapshot && npm run metrics
```

```bash
npm run dev
```

## Limits

- Job posts measure intent to hire, not hires. Daily snapshots record when
  roles close, which approximates filled roles over time.
- Role age comes from each posting's first-published date. A company that
  reposts a role resets that date.
- The Wayback Machine has archived few small startups' boards, so archive
  history covers mostly larger companies.
