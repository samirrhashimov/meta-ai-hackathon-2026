import { useEffect, useState } from "react";
import {
  LuArrowRight,
  LuChartColumn,
  LuFileText,
  LuFiles,
  LuFlame,
  LuFolder,
  LuHistory,
  LuLayoutGrid,
  LuRefreshCw,
  LuSparkles,
  LuTarget,
  LuType,
} from "react-icons/lu";
import { api } from "../api";
import { accentHexes, currentAccent } from "../accent";
import { loadSettings } from "../settings";
import Dashboard from "./Dashboard";

// Center-area Visualise tab: an AI-built visual dashboard generated from the
// user's notes — AI cover art, momentum score, streak/word stats, a writing
// heatmap, and chart/diagram widgets — followed by the always-available
// analytics.
export default function VisualiseView({ onOpenNote }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(refresh) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await api.visualise(refresh));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  if (loading) return <VisualSkeleton />;
  if (error) return <p className="p-6 text-sm danger-text">{error}</p>;

  const { spec, cover, stats, stale, error: visError } = data;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Hero
        spec={spec}
        cover={cover}
        stats={stats}
        refreshing={refreshing}
        onRebuild={() => load(true)}
      />

      {visError && !spec ? (
        <div className="vis-rise rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm text-neutral-500">{visError}</p>
          <p className="mt-1 text-sm text-neutral-500">
            Write some notes first — your visual appears once there is content.
          </p>
        </div>
      ) : (
        <>
          {stats && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard
                index={0}
                label="Day streak"
                value={stats.streak ?? 0}
                icon={<LuFlame size={15} />}
              />
              <StatCard
                index={1}
                label="Words"
                value={stats.totalWords ?? 0}
                icon={<LuType size={15} />}
              />
              <StatCard index={2} label="Notes" value={stats.totalNotes} icon={<LuFileText size={15} />} />
              <StatCard index={3} label="Folders" value={stats.totalFolders} icon={<LuFolder size={15} />} />
            </div>
          )}

          {stats?.perDay && <Heatmap days={stats.perDay} />}

          {spec?.widgets?.map((w, i) => (
            <Widget key={`${w.type}-${i}`} index={i} widget={w} onOpenNote={onOpenNote} />
          ))}
        </>
      )}
      {stale && spec && (
        <p className="mb-4 text-xs text-neutral-600">
          Showing the last built visual (AI is unreachable right now).
        </p>
      )}

      <SectionHead icon={<LuChartColumn size={15} />} title="Analytics" />
      <Dashboard bare />
    </div>
  );
}

// Small section heading with flanking rules.
function SectionHead({ icon, title }) {
  const acc = currentAccent();
  return (
    <div className="mb-4 mt-8 flex items-center gap-3">
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${acc.softText}`}>
        {icon}
        {title}
      </span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}

// Hero banner: AI cover art with a slow zoom, scrim, title + summary,
// glass stat chips, and the momentum score ring.
function Hero({ spec, cover, stats, refreshing, onRebuild }) {
  const acc = currentAccent();
  const hex = accentHexes(loadSettings().accent).hex;
  return (
    <div className="vis-rise relative mb-4 overflow-hidden rounded-2xl border border-white/10">
      {cover ? (
        <img
          src={cover}
          alt=""
          className="vis-kenburns h-60 w-full object-cover sm:h-72"
        />
      ) : (
        <div
          className="h-60 w-full sm:h-72"
          style={{
            background: `radial-gradient(120% 140% at 15% 10%, ${hex}55 0%, transparent 55%), radial-gradient(120% 140% at 85% 90%, ${hex}33 0%, transparent 55%), linear-gradient(135deg, #17171c, #101014)`,
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />
      {refreshing && <div className="vis-shimmer absolute inset-0" />}
      <div className="absolute left-4 top-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <LuSparkles size={12} style={{ color: hex }} />
          AI built
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {spec?.title || "Visualise"}
          </h2>
          {spec?.summary && (
            <p className="mt-1 line-clamp-2 max-w-xl text-sm leading-relaxed text-neutral-300">
              {spec.summary}
            </p>
          )}
          {stats && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <HeroChip icon={<LuFlame size={12} />} text={`${stats.streak ?? 0} day streak`} />
              <HeroChip
                icon={<LuType size={12} />}
                text={`${(stats.totalWords ?? 0).toLocaleString()} words`}
              />
              <HeroChip icon={<LuFileText size={12} />} text={`${stats.totalNotes} notes`} />
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          {spec && <ScoreRing score={spec.score} />}
          <button
            onClick={onRebuild}
            disabled={refreshing}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#06202a] disabled:opacity-60 ${acc.solid}`}
          >
            <LuRefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Building…" : "Rebuild"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HeroChip({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[11px] text-neutral-200 backdrop-blur">
      <span className="text-[var(--acc-bright)]">{icon}</span>
      {text}
    </span>
  );
}

// Momentum score 0-100 as an SVG ring with a tick track and count-up number.
function ScoreRing({ score }) {
  const hex = accentHexes(loadSettings().accent).hex;
  const shown = useCountUp(Math.max(0, Math.min(100, score || 0)));
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-0.5" title={`Momentum ${score}/100`}>
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 64 64" className="h-20 w-20 -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="7"
            strokeDasharray="1.5 4.5"
            strokeLinecap="round"
          />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke={hex}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (shown / 100) * c}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-white">
          {shown}
        </span>
      </div>
      <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-400">
        momentum
      </span>
    </div>
  );
}

// Counts 0 → target on mount (demo-friendly); jumps straight there when the
// user prefers reduced motion.
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (typeof target !== "number" || Number.isNaN(target)) {
      setVal(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function StatCard({ index, label, value, icon }) {
  const acc = currentAccent();
  const shown = useCountUp(typeof value === "number" ? value : 0);
  return (
    <div
      className="vis-rise rounded-xl border border-white/10 bg-white/[0.03] p-3"
      style={{ "--vis-d": `${(index + 1) * 70}ms` }}
    >
      <div className="mb-1.5 inline-flex rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-[var(--acc-bright)]">
        {icon}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${acc.text}`}>
        {(typeof value === "number" ? shown : value).toLocaleString?.() ?? value}
      </p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

// GitHub-style writing heatmap: 26 weeks of per-day note counts, with month
// labels and a Less → More legend.
function Heatmap({ days }) {
  const hex = accentHexes(loadSettings().accent).hex;
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const max = Math.max(1, ...days.map((d) => d.count));
  const monthOf = (iso) =>
    new Date(iso + "T00:00").toLocaleString("en-US", { month: "short" });
  // Label a week column when its month differs from the previous column's.
  let prevMonth = "";
  const labels = weeks.map((w) => {
    const m = monthOf(w[0].date);
    const show = m !== prevMonth;
    prevMonth = m;
    return show ? m : "";
  });
  return (
    <div className="vis-rise mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4" style={{ "--vis-d": "140ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-neutral-200">
          <LuFlame size={14} className="text-[var(--acc-bright)]" />
          Writing heatmap
        </h3>
        <span className="flex items-center gap-1 text-[11px] text-neutral-500">
          Less
          {[0.15, 0.4, 0.65, 0.9, 1].map((a) => (
            <span
              key={a}
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: a === 0.15 ? "rgba(255,255,255,0.08)" : hexWithAlpha(hex, a) }}
            />
          ))}
          More
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            <span className="h-3 text-[9px] leading-3 text-neutral-600">{labels[wi]}</span>
            {w.map((d, di) => (
              <span
                key={di}
                title={`${d.date}: ${d.count} note${d.count === 1 ? "" : "s"}`}
                className="h-3 w-3 rounded-[4px] transition-transform hover:scale-125 hover:ring-1 hover:ring-[var(--acc)]"
                style={{
                  background:
                    d.count === 0
                      ? "rgba(255,255,255,0.06)"
                      : hexWithAlpha(hex, 0.25 + 0.75 * (d.count / max)),
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function hexWithAlpha(hex, alpha) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h}${a}`;
}

const WIDGET_ICONS = {
  stats: <LuLayoutGrid size={14} />,
  goals: <LuTarget size={14} />,
  timeline: <LuHistory size={14} />,
  bars: <LuChartColumn size={14} />,
  notes: <LuFiles size={14} />,
};

function Widget({ index, widget, onOpenNote }) {
  if (widget.type === "stats") return <StatsWidget index={index} widget={widget} />;
  if (widget.type === "goals") return <GoalsWidget index={index} widget={widget} />;
  if (widget.type === "timeline") return <TimelineWidget index={index} widget={widget} />;
  if (widget.type === "bars") return <BarsWidget index={index} widget={widget} />;
  if (widget.type === "notes")
    return <NotesWidget index={index} widget={widget} onOpenNote={onOpenNote} />;
  return null;
}

function Panel({ index, title, type, children }) {
  return (
    <div
      className="vis-rise mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      style={{ "--vis-d": `${(index + 2) * 70}ms` }}
    >
      {title && (
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-neutral-200">
          <span className="text-[var(--acc-bright)]">{WIDGET_ICONS[type]}</span>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function StatsWidget({ index, widget }) {
  const acc = currentAccent();
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {widget.items.map((s, i) => (
        <WidgetNumber key={s.label} index={index + i * 0.5} label={s.label} value={s.value} acc={acc} />
      ))}
    </div>
  );
}

function WidgetNumber({ index, label, value, acc }) {
  const numeric = Number(value);
  const animated = useCountUp(Number.isFinite(numeric) ? numeric : 0);
  return (
    <div
      className="vis-rise rounded-xl border border-white/10 bg-white/[0.03] p-3"
      style={{ "--vis-d": `${(index + 2) * 70}ms` }}
    >
      <p className={`truncate text-xl font-bold tabular-nums ${acc.text}`}>
        {Number.isFinite(numeric) ? animated.toLocaleString() : value}
      </p>
      <p className="truncate text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function GoalsWidget({ index, widget }) {
  const hex = accentHexes(loadSettings().accent).hex;
  return (
    <Panel index={index} title={widget.title} type="goals">
      <div className="flex flex-col gap-3.5">
        {widget.items.map((g) => (
          <div key={g.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-neutral-300">{g.label}</span>
              <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-300">
                {g.percent}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="vis-bar vis-stripes h-full rounded-full transition-[width] duration-500"
                style={{ width: `${g.percent}%`, backgroundColor: hex }}
              />
            </div>
            {g.detail && <p className="mt-1 text-xs text-neutral-500">{g.detail}</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TimelineWidget({ index, widget }) {
  return (
    <Panel index={index} title={widget.title} type="timeline">
      <div className="flex flex-col">
        {widget.items.map((t, i) => (
          <div key={`${t.date}-${t.label}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
            {i < widget.items.length - 1 && (
              <span className="absolute bottom-0 left-[7px] top-5 w-px bg-gradient-to-b from-[var(--acc-a45)] to-transparent" />
            )}
            <span className="mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-[3px] border-[var(--acc)] bg-transparent shadow-[0_0_0_3px_var(--acc-a13)]" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--acc-dim-text)]">
                {t.date}
              </p>
              <p className="text-sm font-medium text-neutral-200">{t.label}</p>
              {t.detail && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{t.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BarsWidget({ index, widget }) {
  const hex = accentHexes(loadSettings().accent).hex;
  const max = Math.max(1, ...widget.items.map((i) => i.value));
  return (
    <Panel index={index} title={widget.title} type="bars">
      <div className="flex flex-col gap-2.5">
        {widget.items.map((b) => (
          <div key={b.label} className="group flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-sm text-neutral-400">{b.label}</span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-white/5">
              <div
                className="vis-bar flex h-full items-center justify-end rounded-md pr-1.5 text-[10px] font-semibold tabular-nums text-[#06202a]"
                style={{ width: `${Math.max(8, (b.value / max) * 100)}%`, backgroundColor: hex }}
              >
                {(b.value / max) > 0.18 && b.value}
              </div>
            </div>
            <span className="w-8 shrink-0 text-right text-sm tabular-nums text-neutral-400">
              {(b.value / max) <= 0.18 && b.value}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NotesWidget({ index, widget, onOpenNote }) {
  const acc = currentAccent();
  return (
    <Panel index={index} title={widget.title} type="notes">
      <div className="flex flex-col gap-1">
        {widget.items.map((n) => (
          <button
            key={n.id}
            onClick={() => onOpenNote(n.id)}
            title={n.reason || n.title}
            className="group flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-white/10 hover:bg-white/5"
          >
            <LuFileText size={15} className="shrink-0 text-neutral-500 transition-colors group-hover:text-[var(--acc-bright)]" />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-sm font-medium ${acc.softText}`}>{n.title}</span>
              {n.reason && (
                <span className="block truncate text-xs text-neutral-600">{n.reason}</span>
              )}
            </span>
            <LuArrowRight
              size={14}
              className="shrink-0 -translate-x-1 text-neutral-600 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
            />
          </button>
        ))}
      </div>
    </Panel>
  );
}

// Loading placeholder: hero-shaped shimmer + panel blocks.
function VisualSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="relative mb-4 h-60 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] sm:h-72">
        <div className="vis-shimmer absolute inset-0" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="h-7 w-56 rounded-lg bg-white/10" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-white/[0.07]" />
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[86px] animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="mb-4 h-44 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]" />
      ))}
    </div>
  );
}
