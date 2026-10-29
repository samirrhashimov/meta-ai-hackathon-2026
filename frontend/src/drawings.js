// Excalidraw drawing helpers. A drawing is a File whose name ends with
// .excalidraw; its bytes are the scene JSON (same format as .excalidraw
// files, so ours round-trip with excalidraw.com).
export const DRAWING_EXT = ".excalidraw";

export function isDrawing(file) {
  return /\.excalidraw$/i.test(file?.name || "");
}

export function blankScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: "flama",
    elements: [],
    appState: { viewBackgroundColor: "transparent" },
    files: {},
  };
}

// Parses stored scene JSON. Returns { elements, appState } or null when the
// content is missing/corrupt (the viewer offers to start fresh then).
export function parseScene(text) {
  try {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.elements)) return null;
    return {
      elements: data.elements,
      appState: data.appState && typeof data.appState === "object" ? data.appState : {},
    };
  } catch {
    return null;
  }
}

// Parses stored scene JSON. Returns { elements, appState, files } or null.
// Collaborators arrive as a plain array in exported files but Excalidraw
// needs a live Map at runtime, so they are dropped (Excalidraw recreates an
// empty session map itself).
export function parseSceneFull(text) {
  const base = parseScene(text);
  if (!base) return null;
  try {
    const data = JSON.parse(text);
    const { collaborators, ...appState } = base.appState;
    return {
      elements: base.elements,
      appState,
      files: data.files && typeof data.files === "object" ? data.files : {},
    };
  } catch {
    return null;
  }
}

// Serializes editor state back to scene JSON. Collaborators hold live Maps
// that JSON cannot represent, so they are always stripped.
export function serializeScene(elements, appState, sceneFiles) {
  const { collaborators, ...rest } = appState || {};
  return JSON.stringify({
    ...blankScene(),
    elements: elements || [],
    appState: rest,
    files: sceneFiles || {},
  });
}
