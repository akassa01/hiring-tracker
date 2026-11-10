// Fetchers for the public job-board APIs of Ashby, Greenhouse, and Lever.
// Each returns a normalized list: { id, title, dept, location, postedAt }.

const UA = { "User-Agent": "hiring-tracker/0.1 (prototype)" };

async function getJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const iso = (v) => (v ? new Date(v).toISOString() : null);

export const fetchers = {
  async ashby(token) {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`);
    if (!d) return null;
    return d.jobs
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        id: j.id,
        title: j.title,
        dept: j.department || j.team || null,
        location: j.location || null,
        postedAt: iso(j.publishedAt),
      }));
  },
  async greenhouse(token) {
    const d = await getJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`);
    if (!d) return null;
    return d.jobs.map((j) => ({
      id: String(j.id),
      title: j.title,
      dept: j.departments?.[0]?.name ?? null,
      location: j.location?.name ?? null,
      postedAt: iso(j.first_published ?? j.updated_at),
    }));
  },
  async lever(token) {
    const d = await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
    if (!d) return null;
    return d.map((j) => ({
      id: j.id,
      title: j.text,
      dept: j.categories?.department ?? j.categories?.team ?? null,
      location: j.categories?.location ?? null,
      postedAt: iso(j.createdAt),
    }));
  },
};

export async function fetchJobs(ats, token) {
  const f = fetchers[ats];
  if (!f) return null;
  return f(token);
}
