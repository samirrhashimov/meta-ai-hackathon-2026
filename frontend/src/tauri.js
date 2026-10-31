import { getCurrentWindow } from "@tauri-apps/api/window";

// Manual drag starter for frameless windows. Must call startDragging
// synchronously inside the mousedown dispatch, so there is no await
// before it. Clicks on buttons, links, fields and [data-no-drag] areas
// (like the tab strip) are left alone so they keep working.
export function startWindowDrag(e) {
  if (e.button !== 0) return;
  if (e.target?.closest?.("button, a, input, select, textarea, [data-no-drag]")) return;
  try {
    const p = getCurrentWindow().startDragging();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {
    // plain browser: nothing to drag
  }
}
