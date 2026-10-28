import { loadSettings } from "./settings";

// Accent colors work through CSS variables (--acc* on <html>), so ANY color
// — a preset or a custom hex — paints every surface identically.
// IMPORTANT: every class below must stay a full literal string —
// Tailwind only generates classes it can read statically.
export function accentClasses() {
  return {
    solid: "bg-[var(--acc)] hover:bg-[var(--acc-bright)] text-[#06202a]",
    softBg: "bg-[color-mix(in_srgb,var(--acc)_12%,transparent)]",
    softBgStrong: "bg-[color-mix(in_srgb,var(--acc)_18%,transparent)]",
    softText: "text-[var(--acc-pale)]",
    softBorder: "border-[color-mix(in_srgb,var(--acc)_30%,transparent)]",
    softHover: "hover:bg-[color-mix(in_srgb,var(--acc)_12%,transparent)]",
    softTextHover: "hover:text-[var(--acc-pale)]",
    borderHover:
      "hover:border-[color-mix(in_srgb,var(--acc)_45%,transparent)]",
    text: "text-[var(--acc)]",
    textDim: "text-[color-mix(in_srgb,var(--acc)_70%,transparent)]",
    dot: "bg-[color-mix(in_srgb,var(--acc)_70%,transparent)]",
    caret: "caret-[var(--acc)]",
    selection: "selection:bg-[color-mix(in_srgb,var(--acc)_30%,transparent)]",
    focusBorder: "focus:border-[var(--acc)]",
    ring: "ring-[var(--acc)]",
    bubbleBorder: "border-[color-mix(in_srgb,var(--acc)_35%,transparent)]",
    bubbleBg: "bg-[color-mix(in_srgb,var(--acc)_15%,transparent)]",
    bubbleDivider: "border-[color-mix(in_srgb,var(--acc)_20%,transparent)]",
    progress: "bg-[var(--acc)]",
  };
}

// Same object for every accent — the CSS variables do the work.
export function currentAccent() {
  return accentClasses();
}

export const ACCENT_PRESETS = [
  { v: "cyan", c: "#22d3ee" },
  { v: "emerald", c: "#34d399" },
  { v: "amber", c: "#fbbf24" },
  { v: "rose", c: "#fb7185" },
];

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Real colors for canvas/SVG use: presets resolve to their hex,
// a custom "#rrggbb" derives bright/pale/dim variants the same way.
export function accentHexes(value) {
  const found = ACCENT_PRESETS.find((p) => p.v === value);
  const hex = found ? found.c : /^#[0-9a-fA-F]{6}$/.test(value || "") ? value : "#22d3ee";
  return {
    hex,
    light: mix(hex, "#ffffff", 0.45),
    bright: mix(hex, "#ffffff", 0.35),
    pale: mix(hex, "#ffffff", 0.72),
    dim: rgba(hex, 0.55),
  };
}

// Applies the accent to <html>: presets use the stylesheet blocks,
// a custom hex writes the same variables inline.
export function applyAccentVars(value) {
  const root = document.documentElement;
  const found = ACCENT_PRESETS.find((p) => p.v === value);
  const style = root.style;
  const VARS = [
    "--acc",
    "--acc-bright",
    "--acc-pale",
    "--acc-a65b",
    "--acc-a55b",
    "--acc-a35b",
    "--acc-a45",
    "--acc-a35",
    "--acc-a25",
    "--acc-a18",
    "--acc-a13",
    "--acc-a07",
    "--acc-a04",
  ];
  if (found) {
    root.dataset.accent = value;
    for (const v of VARS) style.removeProperty(v);
    return;
  }
  const x = accentHexes(value);
  const [r, g, b] = hexToRgb(x.hex);
  root.removeAttribute("data-accent");
  const set = (k, v) => style.setProperty(k, v);
  set("--acc", x.hex);
  set("--acc-bright", x.bright);
  set("--acc-pale", x.pale);
  set("--acc-a65b", rgba(x.bright, 0.65));
  set("--acc-a55b", rgba(x.bright, 0.55));
  set("--acc-a35b", rgba(x.bright, 0.35));
  const a = (t) => `rgba(${r},${g},${b},${t})`;
  set("--acc-a45", a(0.45));
  set("--acc-a35", a(0.35));
  set("--acc-a25", a(0.25));
  set("--acc-a18", a(0.18));
  set("--acc-a13", a(0.13));
  set("--acc-a07", a(0.07));
  set("--acc-a04", a(0.04));
}
