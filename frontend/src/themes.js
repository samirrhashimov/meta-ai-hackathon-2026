import { ACCENT_PRESETS } from "./accent";

// Curated theme gallery (macOS-style previews in Settings → Appearance).
// A theme is a mode + accent pair; anything else counts as Custom.
export const THEMES = [
  { id: "lagoon", name: "Lagoon", theme: "dark", accent: "cyan", blurb: "Dark · Cyan" },
  { id: "sakura", name: "Sakura", theme: "light", accent: "rose", blurb: "Light · Rose" },
  { id: "forest", name: "Forest", theme: "dark", accent: "emerald", blurb: "Dark · Emerald" },
  { id: "honey", name: "Honey", theme: "light", accent: "amber", blurb: "Light · Amber" },
  { id: "blush", name: "Blush", theme: "dark", accent: "rose", blurb: "Dark · Rose" },
  { id: "mint", name: "Mint", theme: "light", accent: "emerald", blurb: "Light · Emerald" },
  { id: "nebula", name: "Nebula", theme: "dark", accent: "violet", blurb: "Dark · Violet" },
  { id: "glacier", name: "Glacier", theme: "light", accent: "cyan", blurb: "Light · Cyan" },
];

export function presetHex(value) {
  return (ACCENT_PRESETS.find((p) => p.v === value) || {}).c || "#22d3ee";
}

// The matching gallery theme for the current settings, or null for Custom.
export function themeOf(settings) {
  const theme = settings.theme || "dark";
  return THEMES.find((t) => t.theme === theme && settings.accent === t.accent) || null;
}
