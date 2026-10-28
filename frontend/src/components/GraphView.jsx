import { useEffect, useMemo, useRef, useState } from "react";
import {
  LuFolder,
  LuLoaderCircle,
  LuNetwork,
  LuRotateCw,
  LuSearch,
} from "react-icons/lu";
import { api } from "../api";

const LINK_STYLE = {
  wikilink: { color: "rgba(34,211,238,0.55)", width: 1.2, dash: [] },
  ai: { color: "rgba(251,191,36,0.7)", width: 1.2, dash: [5, 4] },
  tag: { color: "rgba(228,228,231,0.16)", width: 1, dash: [] },
  folder: { color: "rgba(228,228,231,0.08)", width: 1, dash: [] },
};

// Interactive knowledge graph: notes + folders as nodes, [[WikiLinks]],
// shared tags, folder structure and AI-suggested topics as edges.

// Survives view switches so reopening the graph is instant; refreshed silently.
let graphCache = null;

export default function GraphView({ onOpenNote }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const simRef = useRef({ nodes: [], links: [], byId: new Map() });
  const camRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef(null); // { node } or { pan: true, sx, sy, ox, oy, moved }
  const hoverRef = useRef(null);
  const wakeRef = useRef(null); // restart the physics loop
  const drawRef = useRef(null); // paint one frame without physics

  const [data, setData] = useState(graphCache); // { nodes, links }
  const [loading, setLoading] = useState(!graphCache);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(null); // hovered node id (state mirror for tooltip)
  const [query, setQuery] = useState("");
  const matchIdx = useRef(-1); // cycles through search matches on Enter
  const [show, setShow] = useState({ folders: true, wikilink: true, tag: true, ai: true, folder: true });

  // The graph builds itself on open like Obsidian: wikilink/tag/structure
  // links are computed fresh, AI links generate server-side on first view
  // and are cached until notes change — no manual refresh needed.
  useEffect(() => {
    let alive = true;
    if (!graphCache) setLoading(true);
    api
      .graph(false)
      .then((g) => {
        graphCache = g;
        if (alive) {
          setData(g);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          if (!graphCache) setError(e.message || "Could not load the graph.");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  // Visible subset under the current toggles.
  const visible = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const nodes = data.nodes.filter((n) => n.kind !== "folder" || show.folders);
    const keep = new Set(nodes.map((n) => n.id));
    const links = data.links.filter((l) => show[l.type] !== false && keep.has(l.source) && keep.has(l.target));
    return { nodes, links };
  }, [data, show]);

  // Rebuild the simulation whenever the visible set changes.
  useEffect(() => {
    const prev = simRef.current.byId;
    const nodes = visible.nodes.map((n, i) => {
      const old = prev.get(n.id);
      const a = (i / Math.max(1, visible.nodes.length)) * Math.PI * 2;
      return {
        ...n,
        x: old ? old.x : Math.cos(a) * 220,
        y: old ? old.y : Math.sin(a) * 220,
        vx: 0,
        vy: 0,
        deg: 0,
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = visible.links
      .map((l) => ({ ...l, a: byId.get(l.source), b: byId.get(l.target) }))
      .filter((l) => l.a && l.b);
    for (const l of links) {
      l.a.deg++;
      l.b.deg++;
    }
    simRef.current = { nodes, links, byId };
    wakeRef.current?.(); // fresh layout or filter change settles again
  }, [visible]);

  // Physics + render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    let raf = 0;
    let running = false;
    let still = 0; // frames the layout has barely moved
    let w = 0;
    let h = 0;

    function resize() {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function tick() {
      const { nodes, links } = simRef.current;
      // Repulsion.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 > 90000) continue;
          if (d2 < 1) {
            dx = Math.random() - 0.5;
            dy = Math.random() - 0.5;
            d2 = 1;
          }
          const f = Math.min(2600 / d2, 4);
          const d = Math.sqrt(d2);
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }
      // Springs.
      for (const l of links) {
        const dx = l.b.x - l.a.x;
        const dy = l.b.y - l.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const rest = l.type === "folder" ? 130 : 100;
        const f = ((d - rest) / d) * 0.02;
        const fx = dx * f;
        const fy = dy * f;
        l.a.vx += fx;
        l.a.vy += fy;
        l.b.vx -= fx;
        l.b.vy -= fy;
      }
      // Gravity + damping.
      let maxV = 0;
      for (const n of nodes) {
        if (dragRef.current?.node === n) continue;
        n.vx += -n.x * 0.012;
        n.vy += -n.y * 0.012;
        n.vx *= 0.82;
        n.vy *= 0.82;
        n.x += n.vx;
        n.y += n.vy;
        maxV = Math.max(maxV, n.vx * n.vx + n.vy * n.vy);
      }
      draw();
      // Sleep once settled: no more per-frame physics until something moves.
      if (maxV < 0.0004) still++;
      else still = 0;
      if (still > 90) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    function wake() {
      if (running) return;
      running = true;
      still = 0;
      raf = requestAnimationFrame(tick);
    }

    function draw() {
      const { nodes, links } = simRef.current;
      const cam = camRef.current;
      const hov = hoverRef.current;
      ctx.clearRect(0, 0, w, h);

      // Neighbor set of the hovered node for highlighting.
      let near = null;
      if (hov) {
        near = new Set([hov]);
        for (const l of links) {
          if (l.a.id === hov) near.add(l.b.id);
          else if (l.b.id === hov) near.add(l.a.id);
        }
      }
      const dim = (id) => (near && !near.has(id) ? 0.15 : 1);

      ctx.save();
      ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
      ctx.scale(cam.k, cam.k);

      for (const l of links) {
        const s = LINK_STYLE[l.type] || LINK_STYLE.tag;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = near ? (near.has(l.a.id) && near.has(l.b.id) ? 1 : 0.08) : 1;
        ctx.lineWidth = s.width / cam.k;
        ctx.setLineDash(s.dash);
        ctx.beginPath();
        ctx.moveTo(l.a.x, l.a.y);
        ctx.lineTo(l.b.x, l.b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      for (const n of nodes) {
        const r = (n.kind === "folder" ? 8 : 5) + Math.sqrt(n.deg || 0) * 1.6;
        ctx.globalAlpha = dim(n.id);
        if (n.kind === "folder") {
          ctx.strokeStyle = n.id === hov ? "#e4e4e7" : "#71717a";
          ctx.lineWidth = (n.id === hov ? 2.4 : 1.6) / cam.k;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = n.id === hov ? "#a5f3fc" : "#22d3ee";
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Labels: always when zoomed in, otherwise hover neighborhood only.
        if (cam.k > 0.55 || (near && near.has(n.id))) {
          ctx.fillStyle = n.kind === "folder" ? "#d4d4d8" : "#a1a1aa";
          ctx.font = `${11 / cam.k}px Inter, system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(n.label.slice(0, 28), n.x, n.y + r + 13 / cam.k);
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    wakeRef.current = wake;
    drawRef.current = () => draw();
    wake();
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  function toWorld(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const cam = camRef.current;
    return {
      x: (e.clientX - r.left - r.width / 2 - cam.x) / cam.k,
      y: (e.clientY - r.top - r.height / 2 - cam.y) / cam.k,
    };
  }

  function hitNode(p) {
    const { nodes } = simRef.current;
    let best = null;
    let bestD = 12 / camRef.current.k;
    for (const n of nodes) {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      const r = (n.kind === "folder" ? 8 : 5) + Math.sqrt(n.deg || 0) * 1.6 + 3;
      if (d < Math.max(bestD, r)) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function onMouseDown(e) {
    const p = toWorld(e);
    const node = hitNode(p);
    if (node) {
      node.vx = 0;
      node.vy = 0;
      dragRef.current = { node, moved: false };
      wakeRef.current?.();
    } else {
      const cam = camRef.current;
      dragRef.current = { pan: true, sx: e.clientX, sy: e.clientY, ox: cam.x, oy: cam.y, moved: false };
    }
  }

  function onMouseMove(e) {
    const d = dragRef.current;
    if (d?.node) {
      const p = toWorld(e);
      if (Math.abs(p.x - d.node.x) + Math.abs(p.y - d.node.y) > 0.5) d.moved = true;
      d.node.x = p.x;
      d.node.y = p.y;
      d.node.vx = 0;
      d.node.vy = 0;
      return;
    }
    if (d?.pan) {
      const cam = camRef.current;
      const dx = e.clientX - d.sx;
      const dy = e.clientY - d.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      cam.x = d.ox + dx;
      cam.y = d.oy + dy;
      drawRef.current?.();
      return;
    }
    const node = hitNode(toWorld(e));
    hoverRef.current = node ? node.id : null;
    setHover(node ? node.id : null);
    canvasRef.current.style.cursor = node ? (node.kind === "note" ? "pointer" : "grab") : "default";
    drawRef.current?.();
  }

  function onMouseUp(e) {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.node && !d.moved && d.node.kind === "note") onOpenNote?.(d.node.id);
  }

  function onWheel(e) {
    e.preventDefault();
    const cam = camRef.current;
    const r = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left - r.width / 2;
    const my = e.clientY - r.top - r.height / 2;
    const k2 = Math.min(3, Math.max(0.25, cam.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.x = mx - ((mx - cam.x) / cam.k) * k2;
    cam.y = my - ((my - cam.y) / cam.k) * k2;
    cam.k = k2;
    drawRef.current?.();
  }

  function focusNode(id) {
    const n = simRef.current.byId.get(id);
    if (!n) return;
    camRef.current.x = -n.x * camRef.current.k;
    camRef.current.y = -n.y * camRef.current.k;
    hoverRef.current = id;
    setHover(id);
  }

  // Live matches for the current query (visible nodes only).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return visible.nodes.filter((n) => n.label.toLowerCase().includes(q));
  }, [query, visible]);

  // Enter jumps to the next match, cycling through all of them.
  function searchSubmit(e) {
    e.preventDefault();
    if (matches.length === 0) return;
    matchIdx.current = (matchIdx.current + 1) % matches.length;
    focusNode(matches[matchIdx.current].id);
  }

  const counts = useMemo(() => {
    const c = { wikilink: 0, tag: 0, ai: 0, folder: 0 };
    for (const l of visible.links) if (c[l.type] !== undefined) c[l.type]++;
    return c;
  }, [visible]);

  const hovered = hover ? simRef.current.byId.get(hover) : null;
  const linkCount = hover
    ? simRef.current.links.filter((l) => l.a.id === hover || l.b.id === hover).length
    : 0;

  const pills = [
    { key: "folders", label: "Folders" },
    { key: "wikilink", label: "WikiLinks" },
    { key: "ai", label: "AI links" },
    { key: "folder", label: "Structure" },
  ];

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          dragRef.current = null;
          hoverRef.current = null;
          setHover(null);
        }}
        onWheel={onWheel}
        className="block touch-none"
      />

      {/* Toolbar */}
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-1.5">
        <form
          onSubmit={searchSubmit}
          title={matches.length > 0 ? `${matches.length} match${matches.length === 1 ? "" : "es"} — Enter to jump` : "Find node"}
          className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs ${
            query
              ? "border border-cyan-400/25 bg-cyan-400/10"
              : "glass-menu"
          }`}
        >
          <LuSearch size={13} className={`shrink-0 ${query ? "text-cyan-300" : "text-neutral-500"}`} />
          <input
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              matchIdx.current = -1;
              // Live: jump to the first match while typing; Enter cycles the rest.
              const q = v.trim().toLowerCase();
              if (!q) return;
              const hit = visible.nodes.find((n) => n.label.toLowerCase().includes(q));
              if (hit) {
                matchIdx.current = 0;
                focusNode(hit.id);
              }
            }}
            placeholder="Find node..."
            className="w-24 bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
          />
          {query && (
            <span className={`shrink-0 ${matches.length > 0 ? "text-cyan-100" : "text-neutral-600"}`}>
              {matches.length}
            </span>
          )}
        </form>
        {pills.map((p) => (
          <button
            key={p.key}
            onClick={() => setShow((s) => ({ ...s, [p.key]: !s[p.key] }))}
            title={`Toggle ${p.label}`}
            className={`rounded-xl px-2.5 py-1.5 text-xs ${
              show[p.key]
                ? "border border-cyan-400/25 bg-cyan-400/10 text-cyan-100"
                : "glass-menu text-neutral-500"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="glass-menu absolute bottom-3 left-3 rounded-xl px-3 py-2 text-[11px] leading-relaxed text-neutral-400">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-neutral-300">
          <LuNetwork size={12} className="text-cyan-300" />
          {visible.nodes.length} nodes · {visible.links.length} links
        </p>
        <p>
          <span className="mr-1 inline-block h-px w-4 bg-cyan-300/70 align-middle" />
          WikiLink ({counts.wikilink})
        </p>
        <p>
          <span className="mr-1 inline-block h-px w-4 bg-amber-300/70 align-middle" />
          AI link ({counts.ai})
        </p>
        <p>
          <span className="mr-1 inline-block h-px w-4 bg-white/25 align-middle" />
          Shared tag ({counts.tag})
        </p>
      </div>

      {/* Hover tooltip */}
      {hovered && (
        <div className="glass-menu pointer-events-none absolute bottom-3 right-3 max-w-56 rounded-xl px-3 py-2">
          <p className="flex items-center gap-1.5 truncate text-xs font-medium text-neutral-100">
            {hovered.kind === "folder" && <LuFolder size={12} className="shrink-0 text-neutral-400" />}
            {hovered.label}
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {hovered.kind} · {linkCount} connection{linkCount === 1 ? "" : "s"}
            {hovered.kind === "note" ? " · click to open" : ""}
          </p>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LuLoaderCircle size={20} className="animate-spin text-cyan-300" />
        </div>
      )}
      {!loading && error && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
      {!loading && !error && visible.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <LuFolder size={22} className="mb-1 text-neutral-600" />
          <p className="text-sm font-medium text-neutral-300">No nodes yet</p>
          <p className="max-w-xs text-xs leading-relaxed text-neutral-500">
            Create notes and folders, link them with [[WikiLinks]], and the graph will grow here.
          </p>
        </div>
      )}
      {!loading && !error && visible.nodes.length > 0 && data?.nodes.length > 0 && visible.nodes.length !== data.nodes.length && (
        <div className="absolute right-3 top-3">
          <button
            onClick={() => setShow((s) => ({ folders: true, wikilink: true, tag: true, ai: true, folder: true }))}
            title="Show everything"
            className="glass-menu flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs text-neutral-300 hover:text-neutral-100"
          >
            <LuRotateCw size={12} />
            Reset filters
          </button>
        </div>
      )}
    </div>
  );
}
