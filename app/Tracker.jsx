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

const DAY = 86400000;
const MONTH = 30.4 * DAY;
const shortDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortMonth = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

// Hover and tap layer shared by every chart. `pick` maps the pointer's
// horizontal position (0 to 1 across the plot) to a data index.
function useHover(pick) {
  const [idx, setIdx] = useState(null);
  const handlers = {
    onPointerMove: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setIdx(pick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))));
    },
    onPointerDown: (e) => handlers.onPointerMove(e),
    onPointerLeave: () => setIdx(null),
  };
  return [idx, handlers];
}

// Tooltip positioned at a fraction of the chart's width and height.
function Tip({ x, y, children }) {
  const align = x < 0.2 ? "0%" : x > 0.8 ? "-100%" : "-50%";
  return (
    <div className="tip" style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(${align}, calc(-100% - 8px))` }}>
      {children}
    </div>
  );
}

// Roles posted per 30-day window over the last 12 months (still open).
// Each window ends 30.4 days after the previous one; the last ends today.
// `labeled` adds the month range under the bars and the peak count.
function Spark({ values, generatedAt, labeled = false }) {
  const end = Date.parse(generatedAt);
  const n = values.length;
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const winEnd = (i) => end - (n - 1 - i) * MONTH;
  const [idx, hover] = useHover((f) => Math.min(n - 1, Math.floor(f * n)));
  const w = labeled ? 240 : 96;
  const h = labeled ? 40 : 24;
  const bw = w / n;
  const barH = (v) => (v ? Math.max(2, (v / max) * h) : 1);
  return (
    <div className={`spark ${labeled ? "labeled" : ""}`}>
      <div className="plot" {...hover}>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
          aria-label={`Roles posted per month for the last 12 months, oldest first: ${values.join(", ")}`}>
          {values.map((v, i) => (
            <rect key={i} x={i * bw + 1} y={h - barH(v)} width={bw - 2} height={barH(v)} rx="1"
              fill={i === n - 1 ? "#8f4efe" : v ? "#0b0b0b" : "rgba(0,0,0,.12)"} opacity={idx == null || idx === i ? 1 : 0.35} />
          ))}
        </svg>
        {labeled && values[peak] > 0 && (
          <span className="peak" style={{ left: `${((peak + 0.5) / n) * 100}%`, bottom: `${(barH(values[peak]) / h) * 100}%` }}>
            {values[peak]}
          </span>
        )}
        {idx != null && (
          <Tip x={(idx + 0.5) / n} y={1 - barH(values[idx]) / h}>
            <b>{fmt(values[idx])} {values[idx] === 1 ? "role" : "roles"}</b> posted
            <br />
            {shortDate(winEnd(idx) - MONTH + DAY)} to {idx === n - 1 ? "today" : shortDate(winEnd(idx))}
          </Tip>
        )}
      </div>
      {labeled && (
        <div className="axis-x">
          <span>{shortMonth(winEnd(0))}</span>
          <span>This month</span>
        </div>
      )}
    </div>
  );
}

function WeeklyChart({ all, color, generatedAt }) {
  const W = 1000;
  const H = 280;
  const pad = { l: 44, r: 8, t: 32, b: 28 };
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
  const [idx, hover] = useHover((f) => {
    const i = Math.floor(((f * W - pad.l) / iw) * all.length);
    return i < 0 || i >= all.length ? null : i;
  });
  const weekStart = (i) => end.getTime() - (all.length - i) * 7 * DAY + DAY;
  return (
    <div className="plot" {...hover}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Open roles by week posted, last 26 weeks">
      <text x="0" y="12" className="axis-title">ROLES POSTED</text>
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
            <rect x={x + 2} y={pad.t + ih - h} width={bw - 4} height={h} rx="2" fill={color} opacity={idx == null || idx === i ? 1 : 0.35} />
            <text x={x + bw / 2} y={pad.t + ih - h - 6} textAnchor="middle" style={{ display: bw > 30 && v ? undefined : "none" }}>{v}</text>
            {i % 4 === 1 && (
              <text x={x + bw / 2} y={H - 8} textAnchor="middle">{labelFor(i)}</text>
            )}
          </g>
        );
      })}
    </svg>
    {idx != null && (
      <Tip x={(pad.l + (idx + 0.5) * bw) / W} y={(pad.t + ih - (all[idx] / top) * ih) / H}>
        <b>{fmt(all[idx])} roles</b> posted
        <br />
        {shortDate(weekStart(idx))} to {idx === all.length - 1 ? "today" : shortDate(weekStart(idx) + 6 * DAY)}
      </Tip>
    )}
    </div>
  );
}

const monthYear = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

// Open roles over time from archived and live snapshots. The y-axis starts at
// zero; the first and last values are labeled on the line.
function Line({ series, from }) {
  const t = series.map((p) => Date.parse(p.date));
  const t0 = Math.min(...t);
  const t1 = Math.max(...t);
  const max = Math.max(1, ...series.map((p) => p.open));
  const last = series.length - 1;
  // Fractions of the plot: x across, y down. Leave headroom for the labels.
  const fx = (i) => 0.03 + ((t[i] - t0) / Math.max(1, t1 - t0)) * 0.94;
  const fy = (v) => 1 - (v / max) * 0.72;
  const [idx, hover] = useHover((f) =>
    series.reduce((best, _, i) => (Math.abs(fx(i) - f) < Math.abs(fx(best) - f) ? i : best), 0)
  );
  const W = 240;
  const H = 72;
  const d = series.map((p, i) => `${i ? "L" : "M"}${(fx(i) * W).toFixed(1)},${(fy(p.open) * H).toFixed(1)}`).join("");
  const startLabel = Math.max(0, series.findIndex((p) => p.date === from.fromDate));
  return (
    <div className="line">
      <div className="plot" style={{ height: H }} {...hover}>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
          aria-label={`Open roles over time: ${series.map((p) => `${monthYear(p.date)} ${p.open}`).join(", ")}`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="rgba(0,0,0,.15)" vectorEffect="non-scaling-stroke" />
          <path d={`${d}L${fx(last) * W},${H}L${fx(0) * W},${H}Z`} fill="rgba(143,78,254,.12)" />
          <path d={d} fill="none" stroke="#8f4efe" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
        {series.map((p, i) => (
          <span key={i} className={`dot ${p.src === "live" ? "live" : ""} ${idx === i ? "on" : ""}`}
            style={{ left: `${fx(i) * 100}%`, top: `${fy(p.open) * 100}%` }} />
        ))}
        <span className="end-label start" style={{ left: `${fx(startLabel) * 100}%`, top: `${fy(series[startLabel].open) * 100}%` }}>
          {fmt(series[startLabel].open)}
        </span>
        <span className="end-label end" style={{ left: `${fx(last) * 100}%`, top: `${fy(series[last].open) * 100}%` }}>
          {fmt(series[last].open)}
        </span>
        {idx != null && (
          <Tip x={fx(idx)} y={fy(series[idx].open)}>
            <b>{fmt(series[idx].open)} open roles</b>
            <br />
            {idx === last && series[idx].src === "live" ? "Today" : new Date(series[idx].date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            {series[idx].src === "live" ? " · daily snapshot" : " · archived board"}
          </Tip>
        )}
      </div>
      <div className="axis-x">
        <span>{monthYear(series[0].date)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
const signedPct = (x) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x * 100)}%`);

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw);
}

// Left-side section navigator: one connected shape attached to the left edge.
// At rest it shows section numbers, the active section, and reading progress.
// Hovering a row magnifies it like the macOS Dock. On narrow screens, a
// button opens the list as a panel instead.
function SectionNav({ sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  const [open, setOpen] = useState(false);
  const barRef = useRef(null);
  // A clicked section stays active until the person scrolls by hand. Without
  // this, a section near the bottom can't scroll high enough to become active.
  const pinnedRef = useRef(null);

  useEffect(() => {
    let frame = 0;
    const unpin = () => {
      pinnedRef.current = null;
    };
    const onKey = (e) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key)) unpin();
    };
    // Runs at most once per animation frame. The progress bar is written to
    // the DOM directly as a transform, so scrolling doesn't re-render React
    // or trigger layout. React state changes only when the section changes.
    const update = () => {
      frame = 0;
      const doc = document.documentElement;
      const p = Math.min(1, doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight));
      if (barRef.current) barRef.current.style.transform = `scaleY(${p})`;
      if (pinnedRef.current) return;
      // At the bottom of the page, the last section is active.
      if (doc.scrollTop + doc.clientHeight >= doc.scrollHeight - 2) {
        setActive(sections[sections.length - 1]?.id);
        return;
      }
      // Otherwise, it's the last section whose top is above 40% of the viewport.
      let current = sections[0]?.id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = s.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("wheel", unpin, { passive: true });
    window.addEventListener("touchmove", unpin, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("wheel", unpin);
      window.removeEventListener("touchmove", unpin);
      window.removeEventListener("keydown", onKey);
    };
  }, [sections]);

  const go = (id) => {
    pinnedRef.current = id;
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };
  const current = sections.find((s) => s.id === active);

  // Dock-style magnification: the hovered row gets the widest and shows its
  // details; its neighbors widen a little. `d0` to `d2` are distance classes.
  // With no row hovered, the active section stays expanded.
  const [hovered, setHovered] = useState(null);
  const focusIdx = hovered ?? sections.findIndex((s) => s.id === active);
  const dist = (i) => {
    if (focusIdx < 0) return "";
    const d = Math.abs(i - focusIdx);
    return d <= 2 ? `d${d}` : "";
  };
  const content = (s) => (
    <>
      <span className="secnav-num">{s.num}</span>
      <span className="secnav-text">
        <span className="secnav-title">{s.title}</span>
        {s.meta && <span className="secnav-meta">{s.meta}</span>}
      </span>
    </>
  );

  return (
    <>
      <nav
        className={`secnav ${open ? "open" : ""}`}
        aria-label="Page sections"
        onMouseLeave={() => {
          setOpen(false);
          setHovered(null);
        }}
      >
        {/* The goo filter blurs the row backgrounds together and sharpens the
            result, so rows of different widths read as one fluid shape. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id="secnav-goo" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
          </filter>
        </svg>
        <div className="secnav-stack">
          <ol className="secnav-blobs" aria-hidden="true">
            {sections.map((s, i) => (
              <li key={s.id} className={dist(i)}>
                <span className="secnav-row">{content(s)}</span>
              </li>
            ))}
          </ol>
          <div className="secnav-progress" aria-hidden="true">
            <span ref={barRef} />
          </div>
          <ol className="secnav-items">
            {sections.map((s, i) => (
              <li key={s.id} className={dist(i)}>
                <button
                  className={`secnav-row ${s.id === active ? "active" : ""}`}
                  aria-current={s.id === active ? "true" : undefined}
                  onMouseEnter={() => setHovered(i)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  onClick={() => go(s.id)}
                >
                  {content(s)}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </nav>
      <button className="secnav-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="secnav-num">{current?.num}</span> {current?.title ?? "Sections"}
      </button>
    </>
  );
}

// Custom single-select dropdown in the site's chip style. Follows the ARIA
// select-only combobox pattern: focus stays on the button, arrow keys move the
// highlight, Enter or Space picks, and Escape closes.
function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef(null);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const isDefault = value === options[0].value;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openAt = () => {
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (v) => {
    onChange(v);
    setOpen(false);
  };
  const onKey = (e) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openAt(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(options.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); setCursor(options.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(options[cursor].value); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={`dd ${open ? "open" : ""}`} ref={rootRef}>
      <button
        type="button"
        role="combobox"
        className={`chip dd-button ${isDefault ? "" : "set"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="dd-list"
        aria-label={label}
        aria-activedescendant={open ? `dd-opt-${cursor}` : undefined}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={onKey}
      >
        {selected.label}
        <svg className="dd-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <ul className="dd-list" id="dd-list" role="listbox" aria-label={label}>
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`dd-opt-${i}`}
            role="option"
            aria-selected={o.value === value}
            className={i === cursor ? "cursor" : ""}
            onPointerEnter={() => setCursor(i)}
            onClick={() => pick(o.value)}
          >
            {o.label}
            {o.value === value && (
              <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
                <path d="M1 5l3.5 3.5L11 1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
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

  const hasGrowth = eligible.length > 0;
  const sections = useMemo(
    () => [
      { id: "top", num: "00", title: "Overview" },
      { id: "speedrun", num: "01", title: "speedrun companies" },
      { id: "over-time", num: "02", title: "New roles by week" },
      ...(hasGrowth ? [{ id: "growth", num: "03", title: "Then and now" }] : []),
      { id: "every-company", num: "04", title: "Every portfolio company" },
      { id: "method", num: "05", title: "How we measure this" },
      { id: "next", num: "06", title: "What's next" },
    ],
    [hasGrowth]
  );

  return (
    <main>
      <SectionNav sections={sections} />
      <header className="wrap hero" id="top">
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
          <a className="btn" href="#every-company">Browse every portfolio company</a>
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
              <div className="label mini-title">Roles posted per month</div>
              <Spark values={c.byMonth} generatedAt={data.generatedAt} labeled />
            </a>
          ))}
        </div>
        <p className="note">
          Bar charts count open roles by the month they went up. Each company's chart uses its own scale, so compare
          shapes between companies, not bar heights.
        </p>
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
                <div className="label mini-title">Open roles</div>
                <Line series={c.series} from={c.change} />
              </a>
            ))}
          </div>
          <p className="note">
            Purple points come from Wayback Machine copies of public job boards, one per month at most. The black point
            is the tracker's own daily snapshot. Each chart starts at zero and uses its own scale. Only companies with 20 or more open roles and an archived board from at
            least 90 days ago appear here; most small startups' boards were never archived.
          </p>
        </section>
      )}

      <section className="block wrap" id="every-company">
        <div className="eyebrow">04 · every portfolio company</div>
        <h2>Who's Actually Hiring</h2>
        <p className="intro">
          {fmt(totals.companies)} a16z and speedrun portfolio companies with open roles. Sort by new roles to find
          momentum. Sort by "Open &gt;90d" to find boards full of evergreen or ghost postings.{" "}
          <a href="#coverage" onClick={() => { const d = document.getElementById("coverage"); if (d) d.open = true; }}>
            Which companies are included?
          </a>
        </p>
        <div className="controls">
          {FILTERS.map(([v, l]) => (
            <button key={v} className="chip" aria-pressed={filter === v} onClick={() => { setFilter(v); setLimit(50); }}>
              {l}
            </button>
          ))}
          <Dropdown
            label="Filter by function"
            value={fn}
            options={FUNCTIONS.map((f) => ({
              value: f,
              label: f === "any" ? "Any function" : f === "sales & gtm" ? "Sales & GTM" : f[0].toUpperCase() + f.slice(1),
            }))}
            onChange={(v) => { setFn(v); setLimit(50); }}
          />
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
                  <td><Spark values={c.byMonth} generatedAt={data.generatedAt} /></td>
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
        <details id="coverage">
          <summary>Which companies are included</summary>
          <p>
            The tracker covers {fmt(totals.companies)} companies, not the whole a16z portfolio. A company appears when all
            three of these are true:
          </p>
          <ul>
            <li>It's listed as an a16z or speedrun portfolio company on the speedrun talent network.</li>
            <li>It has at least one open role there. Portfolio companies that aren't hiring, or don't post on the board, don't appear.</li>
            <li>Its job board runs on Ashby, Greenhouse, or Lever, or, for speedrun companies, its roles are on the talent network board.</li>
          </ul>
          <p>
            Companies outside the portfolio are left out, even though the talent network lists their roles too.
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
