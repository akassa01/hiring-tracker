// Daily snapshot: fetch every company's open roles from its ATS and write
//   data/snapshots/YYYY-MM-DD.json  -> open job IDs per company (for diffs)
//   data/jobs-current.json          -> full metadata for today's open roles
//
// Run: node scripts/snapshot.mjs
import fs from "node:fs/promises";
import { fetchJobs } from "./ats.mjs";

const companies = JSON.parse(await fs.readFile("data/companies.json", "utf8"));
const SUPPORTED = ["ashby", "greenhouse", "lever"];

// Speedrun companies without a supported ATS (Gusto, Workable, or native
// postings) are read from the speedrun talent network board instead. The full
// speedrun list is about 5 pages.
// Fetch one page of the board. Retries up to 5 times with growing waits
// (2, 4, 8, 16 seconds) when the request fails or the response has no
// `jobs` list, which happens when the board returns an error or rate-limit page.
async function boardPage(page) {
  const url = `https://speedrun-talent-network.com/api/jobs?portfolio=speedrun&page=${page}`;
  let problem = "";
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "hiring-tracker/0.1 (prototype)" },
        signal: AbortSignal.timeout(30000),
      });
      const body = await res.text();
      let d = null;
      try {
        d = JSON.parse(body);
      } catch {}
      if (res.ok && Array.isArray(d?.jobs) && Number.isFinite(d?.total)) return d;
      problem = `HTTP ${res.status}: ${body.slice(0, 200).replace(/\s+/g, " ")}`;
    } catch (e) {
      problem = e.message;
    }
    if (attempt < 5) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
  }
  throw new Error(
    `The speedrun talent network board returned no job list for page ${page} after 5 attempts (${problem}). ` +
      `No snapshot was written, so the site keeps the previous day's data. Rerun the workflow later.`
  );
}

async function speedrunBoardJobs() {
  const bySlug = {};
  for (let page = 0, pages = Infinity; page < pages; page++) {
    const d = await boardPage(page);
    pages = Math.ceil(d.total / 50); // The API repeats the last page past `total`.
    for (const j of d.jobs)
      (bySlug[j.company_slug] ??= []).push({
        id: j.id,
        title: j.title,
        dept: j.fn ?? null,
        location: j.location ?? null,
        postedAt: j.published_at ?? null,
      });
  }
  return bySlug;
}
const board = await speedrunBoardJobs();
const fetchCompany = (c) =>
  SUPPORTED.includes(c.ats) ? fetchJobs(c.ats, c.token) : Promise.resolve(board[c.slug] ?? []);
const tracked = companies.filter((c) => SUPPORTED.includes(c.ats) || c.tier === "speedrun");
const date = new Date().toISOString().slice(0, 10);

const snapshot = { date, companies: {} };
const current = {};
const failures = [];

async function worker(queue) {
  for (let c; (c = queue.shift()); ) {
    try {
      const jobs = await fetchCompany(c);
      if (!jobs) {
        failures.push(`${c.slug}: board not found`);
        continue;
      }
      snapshot.companies[c.slug] = { open: jobs.length, ids: jobs.map((j) => j.id).sort() };
      current[c.slug] = jobs;
    } catch (e) {
      failures.push(`${c.slug}: ${e.message}`);
    }
  }
}

const queue = [...tracked];
await Promise.all(Array.from({ length: 8 }, () => worker(queue)));

await fs.mkdir("data/snapshots", { recursive: true });
await fs.writeFile(`data/snapshots/${date}.json`, JSON.stringify(snapshot));
await fs.writeFile("data/jobs-current.json", JSON.stringify(current));
const total = Object.values(snapshot.companies).reduce((s, c) => s + c.open, 0);
console.log(`${date}: ${Object.keys(snapshot.companies).length}/${tracked.length} companies, ${total} open roles`);
if (failures.length) console.log(`${failures.length} failures:\n  ` + failures.slice(0, 20).join("\n  "));
