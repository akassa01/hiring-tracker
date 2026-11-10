// Turn raw postings and daily snapshots into per-company hiring signals.
// Reads data/companies.json, data/jobs-current.json, data/snapshots/*.json,
// and data/backfill.json (optional). Writes data/tracker.json for the site.
//
// Run: node scripts/metrics.mjs
import fs from "node:fs/promises";

const DAY = 86400000;
const now = Date.now();
const read = async (p, fallback) => {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return fallback;
  }
};

const companies = await read("data/companies.json", []);
const current = await read("data/jobs-current.json", {});
const backfill = await read("data/backfill.json", {});
const snapFiles = (await fs.readdir("data/snapshots").catch(() => [])).filter((f) => f.endsWith(".json")).sort();
const snapshots = [];
for (const f of snapFiles) snapshots.push(await read(`data/snapshots/${f}`));

// Classify a title into a function bucket.
const FN = [
  ["engineering", /engineer|developer|swe\b|devops|sre\b|infrastructure|platform|security|firmware|backend|frontend|full[- ]?stack/i],
  ["research", /research|scientist|\bml\b|machine learning|\bai\b/i],
  ["product & design", /product manager|\bpm\b|designer|design\b|ux|ui\b/i],
  ["sales & gtm", /sales|account exec|\bae\b|\bsdr\b|\bbdr\b|business development|partnership|customer success|solutions/i],
  ["marketing", /marketing|growth|content|brand|community|social/i],
  ["recruiting", /recruit|talent acquisition|sourcer|people partner/i],
  ["operations", /operations|ops\b|supply|manufactur|technician|quality|logistics/i],
];
const fnOf = (title) => FN.find(([, re]) => re.test(title))?.[0] ?? "other";

const ageDays = (iso) => (iso ? (now - Date.parse(iso)) / DAY : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Diff snapshots: roles that appeared and closed over a window.
function churn(slug, days) {
  const cutoff = now - days * DAY;
  const window = snapshots.filter((s) => Date.parse(s.date) >= cutoff && s.companies[slug]);
  let opened = 0;
  let closed = 0;
  for (let i = 1; i < window.length; i++) {
    const prev = new Set(window[i - 1].companies[slug].ids);
    const next = new Set(window[i].companies[slug].ids);
    for (const id of next) if (!prev.has(id)) opened++;
    for (const id of prev) if (!next.has(id)) closed++;
  }
  return { opened, closed, days: window.length > 1 ? (Date.parse(window.at(-1).date) - Date.parse(window[0].date)) / DAY : 0 };
}

// Open-role count over time: backfill points first, then live snapshots.
function series(slug) {
  const pts = new Map();
  for (const p of backfill[slug] ?? []) pts.set(p.date, { date: p.date, open: p.open, src: "archive" });
  for (const s of snapshots) if (s.companies[slug]) pts.set(s.date, { date: s.date, open: s.companies[slug].open, src: "live" });
  return [...pts.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function signal(m) {
  if (m.open === 0) return "not hiring";
  if (m.open >= 5 && m.staleShare >= 0.6) return "stale listings";
  if (m.new30 >= 5 && m.freshShare >= 0.3) return "hiring fast";
  if (m.new30 === 0 && m.open > 0) return "quiet";
  return "steady";
}

const out = [];
for (const c of companies) {
  const jobs = current[c.slug];
  if (!jobs) continue;
  const ages = jobs.map((j) => ageDays(j.postedAt)).filter((a) => a != null);
  const new30 = ages.filter((a) => a <= 30).length;
  const new90 = ages.filter((a) => a <= 90).length;
  const stale = ages.filter((a) => a > 90).length;
  const fns = {};
  for (const j of jobs) fns[fnOf(j.title)] = (fns[fnOf(j.title)] ?? 0) + 1;
  const titles = {};
  for (const j of jobs) titles[j.title.trim().toLowerCase()] = (titles[j.title.trim().toLowerCase()] ?? 0) + 1;
  const duplicateTitles = Object.values(titles).filter((n) => n > 1).reduce((s, n) => s + n - 1, 0);

  // Postings by month for the last 12 months (roles still open).
  const byMonth = Array(12).fill(0);
  for (const a of ages) {
    const idx = Math.floor(a / 30.4);
    if (idx < 12) byMonth[11 - idx]++;
  }

  const m = {
    slug: c.slug,
    // Drop "(fka - Old Name)" and similar suffixes for display.
    name: c.name.replace(/\s*\([^)]*\)\s*$/, "") || c.name,
    logo: c.logo,
    tier: c.tier,
    cohort: c.cohort,
    ats: c.ats,
    careersUrl:
      c.ats === "ashby" ? `https://jobs.ashbyhq.com/${c.token}`
      : c.ats === "greenhouse" ? `https://job-boards.greenhouse.io/${c.token}`
      : c.ats === "lever" ? `https://jobs.lever.co/${c.token}`
      : null,
    boardUrl: `https://speedrun-talent-network.com/companies/${c.slug}`,
    open: jobs.length,
    new30,
    new90,
    freshShare: jobs.length ? new30 / jobs.length : 0,
    staleShare: ages.length ? stale / ages.length : 0,
    medianAge: median(ages),
    recruiters: fns.recruiting ?? 0,
    duplicateTitles,
    functions: fns,
    byMonth,
    churn30: churn(c.slug, 30),
    series: series(c.slug),
  };
  // Change in open roles since the oldest archived point at least 90 days old.
  const base = m.series.find((p) => now - Date.parse(p.date) >= 90 * DAY);
  m.change = base
    ? { from: base.open, fromDate: base.date, to: m.open, pct: base.open ? (m.open - base.open) / base.open : null }
    : null;
  m.signal = signal(m);
  out.push(m);
}

// Portfolio-wide totals by week posted (roles still open), last 26 weeks.
const weekly = Array(26).fill(0);
const weeklySpeedrun = Array(26).fill(0);
for (const m of out)
  for (const j of current[m.slug]) {
    const a = ageDays(j.postedAt);
    if (a == null) continue;
    const w = Math.floor(a / 7);
    if (w < 26) {
      weekly[25 - w]++;
      if (m.tier === "speedrun") weeklySpeedrun[25 - w]++;
    }
  }

const tracker = {
  generatedAt: new Date(now).toISOString(),
  firstSnapshot: snapshots[0]?.date ?? null,
  snapshotCount: snapshots.length,
  totals: {
    companies: out.length,
    open: out.reduce((s, m) => s + m.open, 0),
    new30: out.reduce((s, m) => s + m.new30, 0),
    hiringFast: out.filter((m) => m.signal === "hiring fast").length,
    stale: out.filter((m) => m.signal === "stale listings").length,
  },
  weekly,
  weeklySpeedrun,
  companies: out.sort((a, b) => b.new30 - a.new30 || b.open - a.open),
};
await fs.writeFile("data/tracker.json", JSON.stringify(tracker));
console.log(tracker.totals);
