import { useEffect, useState } from "react";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import AiPanel from "./components/AiPanel";
import Dashboard from "./components/Dashboard";
import { LuLayoutDashboard, LuPanelLeftOpen, LuPanelRightOpen, LuPlus, LuX } from "react-icons/lu";
import { SiObsidian } from "react-icons/si";
import Resizer from "./components/Resizer";

function RibbonButton({ title, active, onClick, children }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
        active
          ? "bg-cyan-400/20 text-cyan-200"
          : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const [folders, setFolders] = useState([]);
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("notes"); // notes | dashboard
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem("ui.sidebarW")) || 256);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("ui.rightW")) || 320);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("ui.leftOpen") !== "false");
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem("ui.rightOpen") !== "false");
  const [sorting, setSorting] = useState(null); // { done, total } while AI sorts all

  useEffect(() => {
    localStorage.setItem("ui.sidebarW", sidebarW);
  }, [sidebarW]);
  useEffect(() => {
    localStorage.setItem("ui.rightW", rightW);
  }, [rightW]);
  useEffect(() => {
    localStorage.setItem("ui.leftOpen", String(leftOpen));
  }, [leftOpen]);
  useEffect(() => {
    localStorage.setItem("ui.rightOpen", String(rightOpen));
  }, [rightOpen]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    const [f, n] = await Promise.all([api.listFolders(), api.listNotes()]);
    setFolders(f);
    setNotes(n);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError("Could not reach the backend (" + e.message + "). Is it running?"))
      .finally(() => setLoading(false));
  }, []);

  // Wraps a fallible action: shows the error in the banner.
  async function run(fn) {
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  const selectedNote = notes.find((n) => n._id === selectedId) || null;

  function handleSelectNote(id) {
    setSelectedId(id);
    setView("notes");
  }

  function handleNewNote(folderId = null) {
    run(async () => {
      const note = await api.createNote({ title: "New Note", folderId });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note._id);
      setView("notes");
    });
  }

  function handleNewFolder(parentId, name) {
    run(async () => {
      const folder = await api.createFolder(name, parentId);
      setFolders((prev) => [...prev, folder]);
    });
  }

  function handleDeleteFolder(id, name) {
    if (!window.confirm(`Delete the "${name}" folder? Its contents are kept, they become unfiled.`)) return;
    run(async () => {
      await api.deleteFolder(id);
      await refresh(); // folderIds changed, refresh the lists
    });
  }

  function handleSaveNote(id, payload) {
    return run(async () => {
      const updated = await api.updateNote(id, payload);
      setNotes((prev) => prev.map((n) => (n._id === id ? updated : n)));
    });
  }

  // Files every unfiled note into folders with AI, one by one.
  function handleSortAll() {
    const unfiled = notes.filter((n) => !n.folderId);
    if (unfiled.length === 0 || sorting) return;
    run(async () => {
      setSorting({ done: 0, total: unfiled.length });
      let failed = 0;
      try {
        for (const n of unfiled) {
          try {
            await api.organize(n._id);
          } catch {
            failed++;
          }
          setSorting((s) => s && { done: s.done + 1, total: s.total });
        }
      } finally {
        setSorting(null);
        await refresh();
      }
      if (failed > 0) setError(`${failed} note(s) could not be sorted`);
    });
  }

  function handleDeleteNote(id, title) {
    if (!window.confirm(`Delete the "${title}" note?`)) return;
    run(async () => {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n._id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    });
  }

  function handleAttach(noteId, file) {
    return run(async () => {
      const { note } = await api.upload(file, noteId);
      setNotes((prev) => prev.map((n) => (n._id === noteId ? note : n)));
    });
  }

  function handleDetach(noteId, url) {
    const note = notes.find((n) => n._id === noteId);
    if (!note) return;
    run(async () => {
      const updated = await api.updateNote(noteId, {
        attachments: (note.attachments || []).filter((a) => a.url !== url),
      });
      setNotes((prev) => prev.map((n) => (n._id === noteId ? updated : n)));
    });
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col gap-2 p-2 text-neutral-200">
      <div className="flex min-h-0 flex-1 gap-2">
      {/* Ribbon (Obsidian-style icon rail) */}
      <nav className="glass flex w-11 shrink-0 flex-col items-center gap-1 rounded-2xl py-2">
        <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400 text-[#06202a]">
          <SiObsidian size={16} />
        </div>
        <RibbonButton title="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")}>
          <LuLayoutDashboard size={18} />
        </RibbonButton>
        <RibbonButton title="New note" onClick={() => handleNewNote()}>
          <LuPlus size={18} />
        </RibbonButton>
      </nav>

      {/* Left: folders + notes */}
      {leftOpen ? (
      <>
      <aside className="glass shrink-0 overflow-hidden rounded-2xl" style={{ width: sidebarW }}>
        <Sidebar
          folders={folders}
          notes={notes}
          selectedNoteId={selectedId}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          onNewFolder={handleNewFolder}
          onDeleteFolder={handleDeleteFolder}
          onOpenDashboard={() => setView("dashboard")}
          showingDashboard={view === "dashboard"}
          onDeleteNote={handleDeleteNote}
          onCollapse={() => setLeftOpen(false)}
          onSortAll={handleSortAll}
          sorting={sorting}
        />
      </aside>
      <Resizer onResize={(dx) => setSidebarW((w) => Math.min(480, Math.max(180, w + dx)))} />
      </>
      ) : (
      <button
        onClick={() => setLeftOpen(true)}
        title="Open sidebar"
        className="glass flex w-8 shrink-0 items-start justify-center rounded-2xl py-3 text-neutral-400 hover:text-neutral-200"
      >
        <LuPanelLeftOpen size={16} />
      </button>
      )}

      {/* Center: wide AI panel when no note is open, editor otherwise */}
      <main className="glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {view === "dashboard" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Dashboard />
          </div>
        ) : selectedNote ? (
          <NoteEditor
            key={selectedNote._id}
            note={selectedNote}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            onAttach={handleAttach}
            onDetach={handleDetach}
          />
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 py-6">
            <AiPanel onChanged={() => run(refresh)} />
          </div>
        )}
      </main>

      {/* Right: narrow AI panel while a note is open */}
      {view === "notes" && selectedNote && (rightOpen ? (
        <>
        <Resizer onResize={(dx) => setRightW((w) => Math.min(560, Math.max(240, w - dx)))} />
        <aside className="glass shrink-0 overflow-hidden rounded-2xl" style={{ width: rightW }}>
          <AiPanel onChanged={() => run(refresh)} onCollapse={() => setRightOpen(false)} />
        </aside>
        </>
      ) : (
        <button
          onClick={() => setRightOpen(true)}
          title="Open panel"
          className="glass flex w-8 shrink-0 items-start justify-center rounded-2xl py-3 text-neutral-400 hover:text-neutral-200"
        >
          <LuPanelRightOpen size={16} />
        </button>
      ))}

      </div>

      {/* Status bar */}
      <div className="glass flex items-center justify-between rounded-2xl px-3 py-1 text-xs text-neutral-400">
        <span>
          {notes.length} notes · {folders.length} folders
        </span>
        <span>
          {selectedNote
            ? `${selectedNote.content?.split(/\s+/).filter(Boolean).length || 0} words`
            : "Ready"}
        </span>
      </div>

      {/* Error banner */}
      {error && (
        <div className="fixed bottom-4 left-1/2 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border border-red-400/30 bg-neutral-900 px-4 py-2 text-sm text-red-200 shadow-xl">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="flex items-center text-red-300 hover:text-red-100">
            <LuX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
