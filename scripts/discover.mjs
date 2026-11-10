// One-time discovery: list a16z and speedrun portfolio companies from the
// speedrun talent network board, then find each company's ATS board from one
// job's apply link. Writes data/companies.json.
//
// Run: node scripts/discover.mjs
import fs from "node:fs/promises";

const BASE = "https://speedrun-talent-network.com";
const UA = { "User-Agent": "hiring-tracker/0.1 (prototype)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (res.ok) return res.json();
    } catch {
      // Network errors (for example EADDRNOTAVAIL) fall through to a retry.
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(`GET ${url} failed`);
}

async function listCompanies(portfolio) {
  const companies = new Map();
  // The API keeps returning results past `total`, so stop at the reported page count.
  for (let page = 0, pages = Infinity; page < pages; page++) {
    const d = await getJson(`${BASE}/api/jobs?portfolio=${portfolio}&page=${page}`);
    pages = Math.ceil(d.total / 50);
    if (!d.jobs.length) break;
    for (const j of d.jobs) {
      const c = companies.get(j.company_slug) ?? {
        slug: j.company_slug,
        name: j.company_key,
        logo: j.company_logo,
        cohort: j.cohort,
        tier: j.tier,
        boardJobs: 0,
        sampleJobPath: j.path,
      };
      c.boardJobs++;
      companies.set(j.company_slug, c);
    }
    process.stderr.write(`\r${portfolio} page ${page} companies ${companies.size}   `);
    await sleep(250);
  }
  process.stderr.write("\n");
  return [...companies.values()];
}

// Map an apply URL to { ats, token } for the ATS APIs we support.
export function parseAts(url) {
  let m;
  if ((m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/))) return { ats: "ashby", token: m[1] };
  if ((m = url.match(/(?:job-)?boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#&]+)/)))
    return { ats: "greenhouse", token: m[1] };
  if ((m = url.match(/[?&]for=([^&#]+)/)) && url.includes("greenhouse")) return { ats: "greenhouse", token: m[1] };
  if ((m = url.match(/jobs\.lever\.co\/([^/?#]+)/))) return { ats: "lever", token: m[1] };
  return null;
}

const APPLY_RE =
  /https?:\/\/(?:jobs\.ashbyhq\.com|(?:job-)?boards\.greenhouse\.io|jobs\.lever\.co|[a-z0-9.-]+\.(?:myworkdayjobs\.com|workable\.com|rippling\.com|bamboohr\.com|smartrecruiters\.com))[^"'&\\\s<]*/i;

async function findAts(c) {
  let html = null;
  for (let attempt = 0; attempt < 4 && html == null; attempt++) {
    try {
      const res = await fetch(BASE + c.sampleJobPath, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (res.ok) html = await res.text();
      else if (res.status === 404) return null;
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  if (html == null) return null;
  const m = html.match(APPLY_RE);
  if (!m) return { ats: "unknown", token: null, applyUrl: null };
  return { ...(parseAts(m[0]) ?? { ats: "unsupported", token: null }), applyUrl: m[0] };
}

const all = [...(await listCompanies("speedrun")), ...(await listCompanies("a16z"))];
const out = [];
for (const [i, c] of all.entries()) {
  const ats = await findAts(c).catch(() => null);
  out.push({ ...c, ...ats });
  process.stderr.write(`\rats ${i + 1}/${all.length}   `);
  await sleep(200);
}
process.stderr.write("\n");
await fs.writeFile("data/companies.json", JSON.stringify(out, null, 2));
const counts = out.reduce((a, c) => ((a[c.ats ?? "error"] = (a[c.ats ?? "error"] ?? 0) + 1), a), {});
console.log(out.length, "companies", counts);
