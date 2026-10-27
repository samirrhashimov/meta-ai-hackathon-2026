import { useEffect, useState } from "react";
import { api } from "../api";

// Center-area dashboard: stat cards, simple charts, AI digest.
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  async function load(refresh) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      setData(await api.insights(refresh));
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

  if (loading) return <p className="p-6 text-sm text-neutral-500">Loading dashboard...</p>;
  if (error) return <p className="p-6 text-sm text-red-300">{error}</p>;

  const { stats, digest, digestStale, digestError } = data;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="mb-4 text-lg font-semibold text-neutral-100">Dashboard</h2>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Notes" value={stats.totalNotes} />
        <StatCard label="Folders" value={stats.totalFolders} />
        <StatCard label="Unfiled" value={stats.unfiledCount} />
        <StatCard label="Attachments" value={stats.attachmentsTotal} />
      </div>

      <Panel title="Notes per folder">
        {stats.perFolder.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={stats.perFolder.map((f) => ({ label: f.name, count: f.count }))} />
        )}
      </Panel>

      <Panel title="Activity (last 30 days)">
        <ActivityChart days={stats.perDay} />
      </Panel>

      <Panel title="Top tags">
        {stats.topTags.length === 0 ? (
          <Empty />
        ) : (
          <BarList items={stats.topTags.map((t) => ({ label: "#" + t.tag, count: t.count }))} />
        )}
      </Panel>

      <Panel
        title="AI overview"
        action={
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-md border border-cyan-300/30 px-2 py-1 text-xs text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh AI"}
          </button>
        }
      >
        {digestError && !digest ? (
          <p className="text-sm text-neutral-500">{digestError}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed text-neutral-300">{digest.overview}</p>
            {digest.topics?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {digest.topics.map((t) => (
                  <span
                    key={t.topic}
                    className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-100"
                  >
                    {t.topic} · {t.noteCount}
                  </span>
                ))}
              </div>
            )}
            {digest.suggestions?.length > 0 && (
              <ul className="mt-3 list-disc pl-5 text-sm text-neutral-400">
                {digest.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {digestStale && <p className="mt-2 text-xs text-neutral-600">Showing cached data.</p>}
          </>
        )}
      </Panel>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-2xl font-semibold text-cyan-100">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function BarList({ items }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-2">
          <span className="w-32 truncate text-sm text-neutral-400">{i.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-white/5">
            <div className="h-full rounded bg-cyan-400/80" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-sm text-neutral-400">{i.count}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityChart({ days }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const w = 600;
  const h = 120;
  const pad = 8;
  const points = days
    .map((d, i) => {
      const x = pad + (i / (days.length - 1)) * (w - pad * 2);
      const y = h - pad - (d.count / max) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
        <polygon
          points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`}
          fill="rgba(34,211,238,0.08)"
        />
        <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs text-neutral-600">
        <span>{days[0]?.date}</span>
        <span>{days[days.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-neutral-600">Nothing here yet.</p>;
}
