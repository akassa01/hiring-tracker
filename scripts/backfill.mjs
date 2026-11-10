// Backfill open-role counts from Wayback Machine snapshots of each company's
// job board. Takes at most one snapshot per month for the last 12 months.
// Writes data/backfill.json: { slug: [{ date, open }] }.
//
// Run: node scripts/backfill.mjs
import fs from "node:fs/promises";

const UA = { "User-Agent": "hiring-tracker/0.1 (prototype)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The Wayback Machine rarely archives small startups' boards, and each lookup
// is slow, so only backfill the largest boards (by today's open roles).
const LIMIT = Number(process.argv[2] ?? 60);
const openNow = Object.fromEntries(
  JSON.parse(await fs.readFile("data/tracker.json", "utf8")).companies.map((c) => [c.slug, c.open])
);
const companies = JSON.parse(await fs.readFile("data/companies.json", "utf8"))
  .filter((c) => ["ashby", "greenhouse", "lever"].includes(c.ats))
  .sort((a, b) => (openNow[b.slug] ?? 0) - (openNow[a.slug] ?? 0))
  .slice(0, LIMIT);
const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10).replaceAll("-", "");

async function get(url, as = "text") {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(45000) });
      if (res.ok) return as === "json" ? res.json() : res.text();
      if (res.status === 404) return null;
    } catch {}
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

// Candidate archived URLs per ATS, each with a parser that returns a count.
function candidates(ats, t) {
  const jsonLen = (key) => (body) => {
    try {
      const d = JSON.parse(body);
      return (key ? d[key] : d)?.length ?? null;
    } catch {
      return null;
    }
  };
  const uniqueMatches = (re) => (body) => {
    const set = new Set([...body.matchAll(re)].map((m) => m[1]));
    return set.size || null;
  };
  if (ats === "ashby")
    return [
      [`api.ashbyhq.com/posting-api/job-board/${t}`, jsonLen("jobs")],
      [`jobs.ashbyhq.com/${t}`, uniqueMatches(new RegExp(`"id":"([0-9a-f-]{36})","title"`, "g"))],
    ];
  if (ats === "greenhouse")
    return [
      [`boards-api.greenhouse.io/v1/boards/${t}/jobs`, jsonLen("jobs")],
      // The newer Greenhouse board shows 50 roles per page, so a count of 50
      // or more is a capped first page, not the total. Discard it.
      [`job-boards.greenhouse.io/${t}`, (body) => {
        const n = uniqueMatches(new RegExp(`/${t}/jobs/(\\d+)`, "g"))(body);
        return n != null && n < 50 ? n : null;
      }],
      [`boards.greenhouse.io/${t}`, uniqueMatches(new RegExp(`/${t}/jobs/(\\d+)`, "g"))],
    ];
  if (ats === "lever")
    return [
      [`api.lever.co/v0/postings/${t}`, jsonLen(null)],
      [`jobs.lever.co/${t}`, uniqueMatches(new RegExp(`jobs\\.lever\\.co/${t}/([0-9a-f-]{36})`, "g"))],
    ];
  return [];
}

// Keep earlier results, so a rerun only retries companies with no history.
// Pass --fresh to start over.
const fresh = process.argv.includes("--fresh");
const out = fresh ? {} : JSON.parse(await fs.readFile("data/backfill.json", "utf8").catch(() => "{}"));
const coverage = { companies: 0, withHistory: 0, points: 0 };

async function backfillCompany(c) {
  const byMonth = new Map();
  for (const [url, parse] of candidates(c.ats, c.token)) {
    const rows = await get(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&from=${from}&output=json&filter=statuscode:200&collapse=timestamp:6&fl=timestamp`,
      "json"
    );
    for (const [ts] of (rows ?? []).slice(1)) {
      const month = ts.slice(0, 6);
      if (byMonth.has(month)) continue;
      const body = await get(`https://web.archive.org/web/${ts}id_/https://${url}`);
      const open = body ? parse(body) : null;
      if (open != null) byMonth.set(month, { date: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`, open });
      await sleep(300);
    }
  }
  coverage.companies++;
  if (byMonth.size) {
    coverage.withHistory++;
    coverage.points += byMonth.size;
    out[c.slug] = [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  process.stderr.write(`\r${coverage.companies}/${companies.length} companies, ${coverage.withHistory} with history   `);
}

const queue = companies.filter((c) => !out[c.slug]);
await Promise.all(
  Array.from({ length: 3 }, async () => {
    for (let c; (c = queue.shift()); ) await backfillCompany(c);
  })
);
process.stderr.write("\n");
await fs.writeFile("data/backfill.json", JSON.stringify(out));
console.log(coverage);
