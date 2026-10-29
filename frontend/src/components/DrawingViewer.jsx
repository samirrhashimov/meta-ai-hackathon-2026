import "@excalidraw/excalidraw/index.css";
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LuMaximize2, LuMinimize2, LuPenTool, LuTrash2 } from "react-icons/lu";
import { fileContentUrl } from "../api";
import { blankScene, parseSceneFull, serializeScene } from "../drawings";
import { currentAccent } from "../accent";
import TagEditor from "./TagEditor";

// The heavy canvas library (and its CSS) only loads when a drawing opens.
const Excalidraw = lazy(() =>
  import("@excalidraw/excalidraw").then((m) => ({ default: m.Excalidraw }))
);

// A third-party canvas can throw on unexpected scene data; keep that inside
// the tab instead of crashing the whole workspace. The raw error is shown so
// it can be reported instead of guessed.
class DrawingBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false, message: "" };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    this.setState({ message: String(err?.message || err || "") });
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <LuPenTool size={40} className="text-neutral-600" />
          <p className="text-sm text-neutral-400">
            This drawing could not be rendered.
          </p>
          {this.state.message && (
            <p className="max-w-md break-all rounded-lg bg-white/[0.04] p-2 font-mono text-xs text-neutral-500">
              {this.state.message}
            </p>
          )}
          <button
            onClick={() => this.setState({ failed: false, message: "" })}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-sm text-neutral-200 hover:bg-white/10"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Center-area tab content for a .excalidraw file: the full editor canvas,
// autosaving (debounced) plus an explicit Save button and Ctrl+S.
export default function DrawingViewer({
  file,
  active,
  theme,
  onSaveContent,
  onSaveTags,
  onDelete,
  onDirtyChange,
}) {
  const acc = currentAccent();
  const [, setScene] = useState(null); // write-only gate: set once per file
  const [corrupt, setCorrupt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [full, setFull] = useState(false); // fullscreen canvas overlay
  // Stable mirrors: Excalidraw re-syncs whenever initialData/onChange identity
  // changes, so everything it receives must keep its identity or its own
  // onChange echoes back into an infinite update loop.
  const initialRef = useRef(null); // frozen { elements, appState, files } per file
  const saveContentRef = useRef(onSaveContent);
  saveContentRef.current = onSaveContent;
  const dirtyChangeRef = useRef(onDirtyChange);
  dirtyChangeRef.current = onDirtyChange;
  const dirtyRef = useRef(false);
  function setDirtyTracked(v) {
    if (dirtyRef.current === v) return;
    dirtyRef.current = v;
    setDirty(v);
    dirtyChangeRef.current(v);
  }
  const [tags, setTags] = useState(file.tags || []);
  const [tagsTouched, setTagsTouched] = useState(false);
  const latestRef = useRef(null); // latest serialized scene awaiting save
  const savedRef = useRef(null); // last serialized scene written to the server
  const timerRef = useRef(null);
  const flushRef = useRef(null);

  // Fresh file (or background AI tags): adopt unless the user edited them.
  useEffect(() => {
    setTags(file.tags || []);
    setTagsTouched(false);
  }, [file._id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tagsTouched) setTags(file.tags || []);
  }, [file.tags]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tag edits save immediately and adopt the stored value back.
  async function changeTags(t) {
    setTags(t);
    setTagsTouched(true);
    const updated = await onSaveTags(file._id, t);
    if (updated) {
      setTags(updated.tags || []);
      setTagsTouched(false);
    }
  }

  // Load the scene JSON when the file changes. The initial snapshot is frozen
  // in a ref so Excalidraw never sees a new identity for the same file.
  useEffect(() => {
    let alive = true;
    setScene(null);
    setCorrupt(false);
    setDirtyTracked(false);
    latestRef.current = null;
    savedRef.current = null;
    initialRef.current = null;
    fetch(fileContentUrl(file._id))
      .then((r) => {
        if (!r.ok) throw new Error("Load failed");
        return r.text();
      })
      .then((t) => {
        if (!alive) return;
        const parsed = parseSceneFull(t);
        if (!parsed) {
          setCorrupt(true);
          return;
        }
        savedRef.current = t;
        initialRef.current = {
          elements: parsed.elements,
          appState: parsed.appState,
          files: parsed.files,
        };
        setScene(true);
      })
      .catch(() => {
        if (alive) setCorrupt(true);
      });
    return () => {
      alive = false;
      clearTimeout(timerRef.current);
    };
  }, [file._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only real content counts: Excalidraw fires onChange for viewport moves
  // (scroll/zoom/selection) too, and those must not flip the button back to
  // Save — otherwise it never settles on Saved like notes do.
  function contentKey(json) {
    try {
      const d = JSON.parse(json);
      return JSON.stringify({
        e: d.elements,
        bg: d.appState?.viewBackgroundColor,
        f: d.files,
      });
    } catch {
      return json;
    }
  }

  async function flush() {
    const json = latestRef.current;
    if (json == null || contentKey(json) === contentKey(savedRef.current)) {
      setDirtyTracked(false);
      return;
    }
    setSaving(true);
    try {
      await saveContentRef.current(file._id, json);
    } finally {
      setSaving(false);
    }
    if (contentKey(latestRef.current) === contentKey(json)) {
      savedRef.current = json;
      setDirtyTracked(false);
    }
  }
  flushRef.current = flush;

  // Stable identity: recreating this per render makes Excalidraw echo
  // onChange back into an infinite update loop (see initialRef above).
  const handleChange = useCallback((elements, appState, files) => {
    latestRef.current = serializeScene(elements, appState, files);
    if (contentKey(latestRef.current) === contentKey(savedRef.current)) {
      clearTimeout(timerRef.current);
      setDirtyTracked(false);
      return;
    }
    setDirtyTracked(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current?.(), 1200);
  }, []);

  // "Start fresh" replaces a corrupt scene with a blank one (dirty until saved).
  function resetScene() {
    const blank = blankScene();
    initialRef.current = { elements: blank.elements, appState: blank.appState, files: {} };
    setScene(true);
    setCorrupt(false);
    latestRef.current = serializeScene(blank.elements, blank.appState, {});
    setDirtyTracked(true);
  }

  // Ctrl+S / Cmd+S flushes a pending autosave instead of the browser dialog.
  // Capture phase: the Excalidraw canvas stops key-event propagation, so a
  // bubble listener would never fire while drawing.
  const saveRef = useRef(null);
  saveRef.current = flush;
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        if (activeRef.current) saveRef.current?.();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const body = (
    <>
      {/* Title row (same h-12 header line as the other panes) */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <LuPenTool size={15} className="shrink-0 text-neutral-500" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-100">
          {file.name}
        </span>
        <button
          onClick={() => setFull((v) => !v)}
          title={full ? "Exit fullscreen" : "Fullscreen"}
          className="shrink-0 rounded-md p-1.5 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
        >
          {full ? <LuMinimize2 size={15} /> : <LuMaximize2 size={15} />}
        </button>
        <button
          onClick={() => onDelete(file._id, file.name)}
          title="Delete file"
          className="min-w-16 shrink-0 rounded-md px-3 py-1 text-center text-sm font-medium text-neutral-500 hover:bg-red-400/10 danger-hover"
        >
          Delete
        </button>
        <button
          onClick={() => flushRef.current?.()}
          disabled={!dirty || saving}
          className={`min-w-16 shrink-0 rounded-md px-3 py-1 text-center text-sm font-medium ${
            dirty || saving ? currentAccent().solid : "cursor-default bg-white/5 text-neutral-600"
          }`}
        >
          {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
      </div>

      {/* Tags: AI-generated, manually editable (save instantly) */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-1.5">
        <TagEditor tags={tags} onChange={changeTags} />
      </div>

      <div className="min-h-0 flex-1">
        {corrupt ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <LuPenTool size={40} className="text-neutral-600" />
            <p className="text-sm text-neutral-400">
              This drawing file is empty or corrupt and cannot be rendered.
            </p>
            <button
              onClick={resetScene}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${acc.solid}`}
            >
              Start fresh
            </button>
          </div>
        ) : !initialRef.current ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-neutral-600">Loading drawing…</p>
          </div>
        ) : (
          <DrawingBoundary>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-neutral-600">Loading editor…</p>
                </div>
              }
            >
              <div className="drawing-canvas h-full">
                <Excalidraw
                  initialData={initialRef.current}
                  theme={theme === "light" ? "light" : "dark"}
                  onChange={handleChange}
                />
              </div>
            </Suspense>
          </DrawingBoundary>
        )}
      </div>
    </>
  );

  // Fullscreen renders the same tree into a body portal, so the canvas keeps
  // its state (no unmount, no lost strokes) and just gains space.
  if (full) {
    return createPortal(
      <div
        className="fixed inset-0 z-[70] flex flex-col"
        style={{ background: theme === "light" ? "#e8e8ec" : "#101014" }}
      >
        {body}
      </div>,
      document.body
    );
  }
  return <div className="flex min-h-0 flex-1 flex-col">{body}</div>;
}
