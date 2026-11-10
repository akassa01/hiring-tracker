"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const SIGNALS = {
  "hiring fast": { cls: "fast", label: "Hiring fast" },
  steady: { cls: "steady", label: "Steady" },
  quiet: { cls: "quiet", label: "Quiet" },
  "stale listings": { cls: "stale", label: "Stale listings" },
  "not hiring": { cls: "none", label: "Not hiring" },
};

const fmt = (n) => n.toLocaleString("en-US");
const pct = (x) => `${Math.round(x * 100)}%`;
const days = (d) => (d == null ? "–" : d < 1 ? "<1d" : `${Math.round(d)}d`);

function Signal({ s }) {
  const v = SIGNALS[s] ?? SIGNALS.steady;
  return <span className={`pill ${v.cls}`}>{v.label}</span>;
}

function Logo({ src, name, small }) {
  const [ok, setOk] = useState(Boolean(src));
  const ref = useRef(null);
  // An image can fail before hydration, when onError isn't attached yet.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setOk(false);
  }, []);
  if (!ok)
    return (
      <span className={`logo initial ${small ? "sm" : ""}`} aria-hidden="true">
        {name.trim()[0]?.toUpperCase()}
      </span>
    );
  return (
    <img
      ref={ref}
      className={`logo ${small ? "sm" : ""}`}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setOk(false)}
      title={name}
    />
  );
}

// Twelve-bar sparkline of roles posted per month (still open).
function Spark({ values }) {
  const max = Math.max(1, ...values);
  const w = 96;
  const h = 24;
  const bw = w / values.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Roles posted per month, last 12 months: ${values.join(", ")}`}>
      {values.map((v, i) => {
        const bh = v ? Math.max(2, (v / max) * h) : 1;
        return <rect key={i} x={i * bw + 1} y={h - bh} width={bw - 2} height={bh} rx="1" fill={i >= values.length - 1 ? "#8f4efe" : v ? "#0b0b0b" : "rgba(0,0,0,.12)"} />;
      })}
    </svg>
  );
}

function WeeklyChart({ all, color, generatedAt }) {
  const W = 1000;
  const H = 260;
  const pad = { l: 44, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...all);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const bw = iw / all.length;
  const end = new Date(generatedAt);
  const labelFor = (i) => {
    const d = new Date(end.getTime() - (all.length - 1 - i) * 7 * 86400000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  };
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Open roles by week posted, last 26 weeks">
      {ticks.map((v) => {
        const y = pad.t + ih - (v / top) * ih;
        return (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="rgba(0,0,0,.08)" />
            <text x={pad.l - 8} y={y + 4} textAnchor="end">{fmt(v)}</text>
          </g>
        );
      })}
      {all.map((v, i) => {
        const x = pad.l + i * bw;
        const h = (v / top) * ih;
        return (
          <g key={i}>
            <title>{`Week of ${labelFor(i)}: ${fmt(v)} roles`}</title>
            <rect x={x + 2} y={pad.t + ih - h} width={bw - 4} height={h} rx="2" fill={color} />
            <text x={x + bw / 2} y={pad.t + ih - h - 6} textAnchor="middle" style={{ display: bw > 30 && v ? undefined : "none" }}>{v}</text>
            {i % 4 === 1 && (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{labelFor(i)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Open roles over time from archived and live snapshots.
function Line({ series, w = 220, h = 56 }) {
  const t = series.map((p) => Date.parse(p.date));
  const t0 = Math.min(...t);
  const t1 = Math.max(...t);
  const max = Math.max(1, ...series.map((p) => p.open));
  const x = (i) => ((t[i] - t0) / Math.max(1, t1 - t0)) * (w - 8) + 4;
  const y = (v) => h - 4 - (v / max) * (h - 8);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.open).toFixed(1)}`).join("");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Open roles: ${series.map((p) => `${p.date} ${p.open}`).join(", ")}`}>
      <path d={`${d}L${x(series.length - 1)},${h}L${x(0)},${h}Z`} fill="rgba(143,78,254,.12)" />
      <path d={d} fill="none" stroke="#8f4efe" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {series.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.open)} r="2.5" fill={p.src === "live" ? "#0b0b0b" : "#8f4efe"} />
      ))}
    </svg>
  );
}

const monthYear = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const signedPct = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

const FILTERS = [
  ["all", "All companies"],
  ["speedrun", "speedrun only"],
  ["hiring fast", "Hiring fast"],
  ["stale listings", "Stale listings"],
];
const FUNCTIONS = ["any", "engineering", "research", "product & design", "sales & gtm", "marketing", "operations", "recruiting"];
const COLUMNS = [
  ["name", "Company", false],
  ["signal", "Signal", false],
  ["open", "Open roles", true],
  ["new30", "New, 30 days", true],
  ["freshShare", "Posted <30d", true],
  ["staleShare", "Open >90d", true],
  ["medianAge", "Median age", true],
  ["changePct", "vs. archive", true],
  ["byMonth", "Last 12 months", false],
];

export default function Tracker({ data }) {
  const { totals, companies } = data;
  const [filter, setFilter] = useState("all");
  const [fn, setFn] = useState("any");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "new30", dir: -1 });
  const [limit, setLimit] = useState(50);
  const [chart, setChart] = useState("all");
  const [growthDir, setGrowthDir] = useState("up");

  const eligible = useMemo(
    () => companies.filter((c) => c.change?.pct != null && Math.max(c.change.from, c.open) >= 20),
    [companies]
  );
  const shrinking = eligible.filter((c) => c.change.pct < 0).length;
  const growth = useMemo(() => {
    return eligible
      .sort((a, b) => (growthDir === "up" ? b.change.pct - a.change.pct : a.change.pct - b.change.pct))
      .filter((c) => (growthDir === "up" ? c.change.pct > 0 : c.change.pct < 0))
      .slice(0, 9);
  }, [eligible, growthDir]);

  const speedrun = useMemo(
    () => companies.filter((c) => c.tier === "speedrun" && c.open > 0).sort((a, b) => b.new30 - a.new30 || b.open - a.open),
    [companies]
  );
  const srTotals = useMemo(
    () => ({
      companies: speedrun.length,
      open: speedrun.reduce((s, c) => s + c.open, 0),
      new30: speedrun.reduce((s, c) => s + c.new30, 0),
    }),
    [speedrun]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = companies.filter((c) => c.open > 0);
    if (filter === "speedrun") r = r.filter((c) => c.tier === "speedrun");
    else if (filter !== "all") r = r.filter((c) => c.signal === filter);
    if (fn !== "any") r = r.filter((c) => (c.functions[fn] ?? 0) > 0);
    if (needle) r = r.filter((c) => c.name.toLowerCase().includes(needle));
    const k = sort.key;
    const val = (c) =>
      k === "name" || k === "signal" ? c[k]
      : k === "changePct" ? c.change?.pct ?? (sort.dir < 0 ? -Infinity : Infinity)
      : fn !== "any" && k === "open" ? c.functions[fn] ?? 0
      : c[k] ?? -1;
    return [...r].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === "string") return x.localeCompare(y) * sort.dir;
      return (x - y) * sort.dir || b.open - a.open;
    });
  }, [companies, filter, fn, q, sort]);

  const setSortKey = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "name" || key === "signal" ? 1 : -1 }));

  const updated = new Date(data.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <main>
      <header className="wrap hero">
        <div className="eyebrow">Talent network · live data · updated {updated}</div>
        <h1>
          The Hiring <span className="grad">Tracker</span>
        </h1>
        <p className="lede">
          The layoffs tracker shows who's cutting. This shows who's actually growing: which portfolio companies post new
          roles every week, and which job posts have sat open for months.
        </p>
        <div className="btns">
          <a className="btn primary" href="#speedrun">See speedrun companies</a>
          <a className="btn" href="#every-company">Browse every company</a>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="label">Open roles</div>
            <div className="num">{fmt(totals.open)}</div>
            <div className="sub">across {fmt(totals.companies)} a16z and speedrun companies</div>
          </div>
          <div className="stat">
            <div className="label">Posted in the last 30 days</div>
            <div className="num">{fmt(totals.new30)}</div>
            <div className="sub">{pct(totals.new30 / Math.max(1, totals.open))} of everything open</div>
          </div>
          <div className="stat">
            <div className="label">Hiring fast</div>
            <div className="num">{fmt(totals.hiringFast)}</div>
            <div className="sub">companies with 5+ new roles this month</div>
          </div>
          <div className="stat">
            <div className="label">Stale listings</div>
            <div className="num">{fmt(totals.stale)}</div>
            <div className="sub">companies where most roles are 90+ days old</div>
          </div>
        </div>
      </header>

      <section className="block wrap" id="speedrun">
        <div className="eyebrow">01 · speedrun first</div>
        <h2>speedrun Companies Hiring Now</h2>
        <p className="intro">
          {fmt(srTotals.companies)} speedrun companies have {fmt(srTotals.open)} open roles, and {fmt(srTotals.new30)} went
          up in the last 30 days. Small teams hire a few people at a time, so a single new role here is a big deal.
        </p>
        <div className="cards">
          {speedrun.map((c) => (
            <a className="card" key={c.slug} href={c.careersUrl ?? c.boardUrl} target="_blank" rel="noreferrer">
              <div className="card-head">
                <Logo src={c.logo} name={c.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-name">{c.name}</div>
                  {c.cohort && <span className="pill cohort">{c.cohort}</span>}
                </div>
                <Signal s={c.signal} />
              </div>
              <div className="card-meta">
                <div>
                  <b>{c.open}</b>open
                </div>
                <div>
                  <b>{c.new30}</b>new in 30d
                </div>
                <div>
                  <b>{days(c.medianAge)}</b>median age
                </div>
              </div>
              <Spark values={c.byMonth} />
            </a>
          ))}
        </div>
      </section>

      <section className="block wrap" id="over-time">
        <div className="eyebrow">02 · over time</div>
        <h2>New Roles by Week</h2>
        <p className="intro">
          Every currently open role, grouped by the week it went up. Tall recent bars mean companies are adding roles now,
          not recycling old ones.
        </p>
        <div className="controls">
          <button className="chip" aria-pressed={chart === "all"} onClick={() => setChart("all")}>All portfolio companies</button>
          <button className="chip" aria-pressed={chart === "speedrun"} onClick={() => setChart("speedrun")}>speedrun companies</button>
        </div>
        <WeeklyChart
          all={chart === "all" ? data.weekly : data.weeklySpeedrun}
          color={chart === "all" ? "#0b0b0b" : "#8f4efe"}
          generatedAt={data.generatedAt}
        />
        <p className="note">
          Bars count roles that are still open today, so older weeks undercount: roles that filled or closed have dropped
          off. Daily snapshots started {data.firstSnapshot ?? "today"} and record openings and closings from then on, so
          this chart fills in with real churn data over time.
        </p>
      </section>

      {growth.length > 0 && (
        <section className="block wrap" id="growth">
          <div className="eyebrow">03 · then and now</div>
          <h2>{shrinking > 0 ? "Who's Growing, Who's Pulling Back" : "Boards That Keep Growing"}</h2>
          <p className="intro">
            Open roles today compared with archived copies of each company's job board. A board that keeps growing for
            months is a company that keeps hiring.
          </p>
          {shrinking > 0 && (
            <div className="controls">
              <button className="chip" aria-pressed={growthDir === "up"} onClick={() => setGrowthDir("up")}>Growing</button>
              <button className="chip" aria-pressed={growthDir === "down"} onClick={() => setGrowthDir("down")}>Pulling back</button>
            </div>
          )}
          <div className="cards">
            {growth.map((c) => (
              <a className="card" key={c.slug} href={c.careersUrl ?? c.boardUrl} target="_blank" rel="noreferrer">
                <div className="card-head">
                  <Logo src={c.logo} name={c.name} />
                  <div className="card-name" style={{ flex: 1, minWidth: 0 }}>{c.name}</div>
                  <span className={`pill ${c.change.pct >= 0 ? "fast" : "stale"}`}>{signedPct(c.change.pct)}</span>
                </div>
                <Line series={c.series} />
                <div className="card-meta">
                  <div><b>{fmt(c.change.from)}</b>{monthYear(c.change.fromDate)}</div>
                  <div><b>{fmt(c.change.to)}</b>today</div>
                </div>
              </a>
            ))}
          </div>
          <p className="note">
            Purple points come from Wayback Machine copies of public job boards, one per month at most. Black points are
            the tracker's own daily snapshots. Only companies with 20 or more open roles and an archived board from at
            least 90 days ago appear here; most small startups' boards were never archived.
          </p>
        </section>
      )}

      <section className="block wrap" id="every-company">
        <div className="eyebrow">04 · every company</div>
        <h2>Who's Actually Hiring</h2>
        <p className="intro">
          Sort by new roles to find momentum. Sort by "Open &gt;90d" to find boards full of evergreen or ghost postings.
        </p>
        <div className="controls">
          {FILTERS.map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={filter === v} onClick={() => { setFilter(v); setLimit(50); }}>
              {l}
            </button>
          ))}
          <select className="search" aria-label="Filter by function" value={fn} onChange={(e) => { setFn(e.target.value); setLimit(50); }}>
            {FUNCTIONS.map((f) => (
              <option key={f} value={f}>{f === "any" ? "Any function" : f[0].toUpperCase() + f.slice(1)}</option>
            ))}
          </select>
          <input className="search" type="search" placeholder="Search companies" aria-label="Search companies" value={q} onChange={(e) => { setQ(e.target.value); setLimit(50); }} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {COLUMNS.map(([key, label, num]) => (
                  <th key={key} className={num ? "num" : ""} aria-sort={sort.key === key ? (sort.dir > 0 ? "ascending" : "descending") : undefined}>
                    {key === "byMonth" ? label : (
                      <button onClick={() => setSortKey(key)}>
                        {key === "open" && fn !== "any" ? `Open (${fn})` : label}
                        {sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((c) => (
                <tr key={c.slug}>
                  <td>
                    <div className="co">
                      <Logo src={c.logo} name={c.name} small />
                      <a href={c.careersUrl ?? c.boardUrl} target="_blank" rel="noreferrer">{c.name}</a>
                      {c.tier === "speedrun" && <span className="pill sr">speedrun</span>}
                    </div>
                  </td>
                  <td><Signal s={c.signal} /></td>
                  <td className="num">{fmt(fn !== "any" ? c.functions[fn] ?? 0 : c.open)}</td>
                  <td className="num">{fmt(c.new30)}</td>
                  <td className="num">{pct(c.freshShare)}</td>
                  <td className="num">{pct(c.staleShare)}</td>
                  <td className="num">{days(c.medianAge)}</td>
                  <td className="num" title={c.change ? `${c.change.from} open in ${monthYear(c.change.fromDate)}` : "No archived board"}>
                    {signedPct(c.change?.pct)}
                  </td>
                  <td><Spark values={c.byMonth} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No companies match these filters.</div>}
        </div>
        {rows.length > limit && (
          <button className="btn more" onClick={() => setLimit((l) => l + 50)}>
            Show 50 more · {fmt(rows.length - limit)} left
          </button>
        )}
      </section>

      <section className="block wrap" id="method">
        <div className="eyebrow">05 · how we measure this</div>
        <h2>Real Hiring, Not Job Spam</h2>
        <p className="intro">
          A careers page with 40 open roles can mean fast growth or a backlog of posts nobody is working on. These signals
          separate the two.
        </p>
        <details>
          <summary>Where the data comes from</summary>
          <p>
            Every day, a scheduled job reads each company's public job board through the Ashby, Greenhouse, and Lever
            posting APIs. Companies come from the a16z and speedrun portfolios on the speedrun talent network. Each daily
            snapshot is committed to the project's git history, so every number is auditable.
          </p>
          <p>
            About half of speedrun companies don't use one of those three systems. For them, the tracker reads their
            listings from the speedrun talent network board. History before the first snapshot comes from Wayback
            Machine copies of the largest companies' job boards.
          </p>
        </details>
        <details>
          <summary>What the signals mean</summary>
          <ul>
            <li><b>Hiring fast:</b> 5 or more roles posted in the last 30 days, and at least 30% of open roles are new.</li>
            <li><b>Steady:</b> new roles are going up at a normal pace.</li>
            <li><b>Quiet:</b> roles are open, but nothing new went up in 30 days.</li>
            <li><b>Stale listings:</b> 5 or more open roles, and 60% or more have been open longer than 90 days. These are often evergreen or ghost postings.</li>
          </ul>
        </details>
        <details>
          <summary>What this can't tell you yet</summary>
          <p>
            Job posts measure intent to hire, not hires. Daily snapshots fix part of that: when a role disappears, it was
            filled or pulled, and the churn rate shows how fast roles turn over. Headcount growth needs a verified source,
            which is the first item on the roadmap below. Ages come from each role's first-published date. A company that
            closes and reposts the same role resets that date. Daily snapshots catch those reposts going forward.
          </p>
        </details>
      </section>

      <section className="block wrap" id="next">
        <div className="eyebrow">06 · what's next</div>
        <h2>Where This Goes</h2>
        <p className="intro">Version 1 reads public job boards. The next versions add signals only speedrun can get.</p>
        <div className="next-grid">
          <div className="next-item">
            <h3>Verified hiring badge</h3>
            <p>
              Founders connect their ATS or payroll (Ashby, Greenhouse, Gusto, Rippling) read-only. The tracker shows real
              hires and headcount growth in bands, with a Verified badge. Self-reported numbers stay labeled as
              self-reported.
            </p>
          </div>
          <div className="next-item">
            <h3>Layoffs to hiring bridge</h3>
            <p>
              Every layoff on the layoffs tracker links to companies hiring fast for the same roles. Someone who just lost
              a job gets a next step and a reason to join the network.
            </p>
          </div>
          <div className="next-item">
            <h3>Trust signals on every job</h3>
            <p>
              Each listing on the jobs board shows its age, a repost flag, and the company's hiring signal, so candidates
              spend applications where they'll get answers.
            </p>
          </div>
          <div className="next-item">
            <h3>Hiring data in the MCP server</h3>
            <p>
              AI agents can ask "which seed-stage companies are hiring backend engineers fastest?" and get a ranked answer
              from live data.
            </p>
          </div>
        </div>
      </section>

      <footer className="wrap">
        An independent prototype built for a speedrun Product Engineer application. Not an official a16z or speedrun
        product. Data comes from public job-board APIs and the public speedrun talent network.
      </footer>
    </main>
  );
}
