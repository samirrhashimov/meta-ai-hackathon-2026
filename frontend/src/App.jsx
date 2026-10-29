import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import FileViewer, { FileTypeIcon } from "./components/FileViewer";
import TagsModal from "./components/TagsModal";
import Modal, { Kbd } from "./components/Modal";
import AiPanel from "./components/AiPanel";
import Dashboard from "./components/Dashboard";
import GraphView from "./components/GraphView";
import SettingsModal from "./components/SettingsModal";
import { loadSettings, saveSettings } from "./settings";
import { LuFileText, LuFolderCheck, LuHouse, LuLayoutDashboard, LuPanelLeftClose, LuPanelLeftOpen, LuPanelRightClose, LuPanelRightOpen, LuSearch, LuSettings, LuTag, LuUndo2, LuWaypoints, LuX } from "react-icons/lu";
import Resizer from "./components/Resizer";
import { applyAccentVars, currentAccent } from "./accent";
import logo from "./assets/flama_icon.png";
import logoDark from "./assets/flama_icon_dark.png";

function NavButton({ title, active, onClick, children, dim }) {
  const acc = currentAccent();
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        active
          ? `${acc.softBgStrong} ${acc.softText}`
          : dim
            ? "cursor-default text-neutral-600"
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
  const [tabs, setTabs] = useState([]); // open tab ids: note ids + `file:<id>`, Chrome-style
  const [files, setFiles] = useState([]); // uploaded files (images, pdfs) stored in MongoDB
  const [activeId, setActiveId] = useState(null);
  const [previewId, setPreviewId] = useState(null); // VS Code-style transient tab
  const [dirtyIds, setDirtyIds] = useState([]); // tabs with unsaved changes
  const [closingId, setClosingId] = useState(null); // dirty tab awaiting discard confirm
  const [deletingNote, setDeletingNote] = useState(null); // { id, title } awaiting delete confirm
  const [deletingFile, setDeletingFile] = useState(null); // { id, name } awaiting delete confirm
  const [deletingFolder, setDeletingFolder] = useState(null); // { id, name } awaiting delete confirm
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false); // tags browser modal
  const [searchQ, setSearchQ] = useState("");
  const [searchAnchor, setSearchAnchor] = useState(null); // dropdown position under the button
  const [view, setView] = useState("notes"); // notes | dashboard | graph
  const [settings, setSettingsState] = useState(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const acc = currentAccent();

  // Synchronous write: the live cache is fresh before the next render,
  // so accent/font changes paint immediately (no one-step lag).
  function setSettings(next) {
    saveSettings(next);
    setSettingsState(next);
  }

  // Persist settings + expose font/accent/theme to CSS.
  // The "dark" logo variant belongs to the dark theme.
  const logoSrc = settings.theme === "light" ? logo : logoDark;
  useEffect(() => {
    saveSettings(settings);
    applyAccentVars(settings.accent || "cyan");
    document.documentElement.dataset.font = settings.editorFont || "m";
    document.documentElement.dataset.theme = settings.theme || "dark";
  }, [settings]);
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem("ui.sidebarW")) || 256);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("ui.rightW")) || 320);
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem("ui.leftOpen") !== "false");
  const [draggingPane, setDraggingPane] = useState(false); // suspends width transition mid-drag
  const [rightOpen, setRightOpen] = useState(() => localStorage.getItem("ui.rightOpen") !== "false");
  const [sorting, setSorting] = useState(null); // { done, total } while AI sorts all
  const [sortConfirm, setSortConfirm] = useState(false); // Auto Sort warning modal
  const [sortDontShow, setSortDontShow] = useState(false); // its "don't show again"
  const [renaming, setRenaming] = useState(null); // { kind: 'note'|'folder', id } | null

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
  // Filing toast: { key, message, noteId, folderId, created } — auto-dismisses.
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function refresh() {
    const [f, n, fl] = await Promise.all([api.listFolders(), api.listNotes(), api.listFiles()]);
    setFolders(f);
    setNotes(n);
    setFiles(fl);
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError("Could not reach the backend (" + e.message + "). Is it running?"))
      .finally(() => setLoading(false));
  }, []);

  // Wraps a fallible action: shows the error in the banner. Returns fn's result.
  async function run(fn) {
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  // File tabs share the tab strip with notes: their ids are `file:<fileId>`.
  const isFileTab = (id) => typeof id === "string" && id.startsWith("file:");
  const fileIdOf = (tabId) => tabId.slice("file:".length);

  const activeNote = !isFileTab(activeId) ? notes.find((n) => n._id === activeId) || null : null;
  const activeFile = isFileTab(activeId)
    ? files.find((f) => f._id === fileIdOf(activeId)) || null
    : null;
  // The center shows a tab (not the Assistant): used for the right pane + toggle.
  const centerHasTab = view === "notes" && (activeNote !== null || activeFile !== null);

  const sq = searchQ.trim().toLowerCase();
  const searchResults = sq ? notes.filter((n) => n.title.toLowerCase().includes(sq)) : [];

  // Drop tabs whose notes/files vanished (e.g. deleted via AI chat).
  useEffect(() => {
    const tabAlive = (id) =>
      isFileTab(id) ? files.some((f) => f._id === fileIdOf(id)) : notes.some((n) => n._id === id);
    setTabs((prev) => {
      const next = prev.filter(tabAlive);
      if (next.length !== prev.length && activeId && !next.includes(activeId)) {
        setActiveId(next[next.length - 1] ?? null);
      }
      return next;
    });
    setDirtyIds((prev) => prev.filter((id) => notes.some((n) => n._id === id)));
    if (previewId && !tabAlive(previewId)) setPreviewId(null);
  }, [notes, files, activeId, previewId]);

  // VS Code logic: opening a note replaces the transient preview tab,
  // unless that tab was edited (then it is pinned). An already-open tab activates.
  function openTab(id) {
    if (tabs.includes(id)) {
      setActiveId(id);
      setView("notes");
      return;
    }
    if (previewId && !dirtyIds.includes(previewId)) {
      setTabs((prev) => prev.map((t) => (t === previewId ? id : t)));
    } else {
      setTabs((prev) => [...prev, id]);
    }
    setPreviewId(id);
    setActiveId(id);
    setView("notes");
  }

  // Navbar drop (and other explicit opens): always a fresh tab.
  function openTabPinned(id) {
    setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
    setView("notes");
  }

  function handleSelectNote(id) {
    openTab(id);
  }

  // File tabs join the same strip: opening a file replaces the transient
  // preview tab unless that tab was edited (then the file pins a new tab).
  function openFileTab(fid) {
    const id = `file:${fid}`;
    if (tabs.includes(id)) {
      setActiveId(id);
      setView("notes");
      return;
    }
    if (previewId && !dirtyIds.includes(previewId)) {
      setTabs((prev) => prev.map((t) => (t === previewId ? id : t)));
    } else {
      setTabs((prev) => [...prev, id]);
    }
    setPreviewId(id);
    setActiveId(id);
    setView("notes");
  }

  function openFileTabPinned(fid) {
    const id = `file:${fid}`;
    setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
    setView("notes");
  }

  function handleSelectFile(fid) {
    openFileTab(fid);
  }

  // Clicking a [[WikiLink]] opens that note, creating it when missing.
  function handleOpenWikiLink(title) {
    const t = (title || "").trim();
    if (!t) return;
    const found = notes.find((n) => n.title.toLowerCase() === t.toLowerCase());
    if (found) {
      openTabPinned(found._id);
      return;
    }
    run(async () => {
      const note = await api.createNote({ title: t, folderId: null });
      setNotes((prev) => [note, ...prev]);
      openTabPinned(note._id);
    });
  }

  function closeTab(id) {
    const idx = tabs.indexOf(id);
    const next = tabs.filter((t) => t !== id);
    setTabs(next);
    if (previewId === id) setPreviewId(null);
    setDirtyIds((prev) => prev.filter((x) => x !== id));
    if (activeId === id) setActiveId(next[idx - 1] ?? next[idx] ?? null);
  }

  function requestCloseTab(id) {
    if (dirtyIds.includes(id)) setClosingId(id);
    else closeTab(id);
  }

  function handleDirtyChange(id, dirty) {
    setDirtyIds((prev) => {
      if (dirty) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
    if (dirty) setPreviewId((prev) => (prev === id ? null : prev)); // edited tabs pin
  }

  // A note dropped onto the navbar opens as a new tab.
  function handleNavbarDrop(e) {
    e.preventDefault();
    try {
      const p = JSON.parse(e.dataTransfer.getData("text/plain"));
      if (p?.kind === "note" && p.id) openTabPinned(p.id);
      else if (p?.kind === "file" && p.id) openFileTabPinned(p.id);
    } catch {
      // not our drag payload: ignore
    }
  }

  function handleNewNote(folderId = null) {
    run(async () => {
      // Creation stays instant: the note is saved with a plain insert first and
      // the UI updates right away. AI filing starts in the background at once
      // (so untouched "New Note"s get filed too) and runs again after the
      // rename, when the note has a real title worth classifying.
      const note = await api.createNote({ title: "New Note", folderId });
      setNotes((prev) => [note, ...prev]);
      openTab(note._id);
      setRenaming({ kind: "note", id: note._id });
      if (!folderId && settings.autoSort) autoSortNote(note._id, "New Note");
    });
  }

  // AI filing in the background: the UI stays instant, and a toast reports
  // where the note landed with an Undo action. Failures surface in the error
  // banner instead of vanishing silently, so a missing key or a dead AI
  // service is visible right away.
  function autoSortNote(id, title) {
    api
      .organize(id)
      .then((result) => {
        refresh();
        const name = result?.folder?.name;
        if (name) {
          setToast({
            key: Date.now(),
            noteId: id,
            folderId: result.folder._id,
            created: result.created,
            title: title || "Note",
            folder: name,
          });
        }
      })
      .catch((e) => setError(`Auto Sort failed (${e.message}). Check Settings → API Connection.`));
  }

  function handleRenameNote(id, title) {
    setRenaming(null); // close the field at once; a failed save shows the error banner
    run(async () => {
      const updated = await api.updateNote(id, { title });
      setNotes((prev) => prev.map((n) => (n._id === id ? updated : n)));
      // Auto-sort runs in the background after the rename, so the field closes
      // instantly and the AI files the note by its real title, not "New Note".
      // Locked notes are never auto-sorted.
      const folderId = updated.folderId?._id || updated.folderId || null;
      if (settings.autoSort && !folderId && !updated.locked) autoSortNote(id, updated.title);
    });
  }

  // Undo an AI filing from the toast: the note goes back to unsorted, and an
  // AI-created folder is removed when it stayed empty.
  function undoAutoSort() {
    const t = toast;
    if (!t) return;
    setToast(null);
    run(async () => {
      await api.undoOrganize({
        noteId: t.noteId,
        folderId: t.folderId,
        deleteFolder: t.created,
      });
      await refresh();
    });
  }

  function handleRenameFolder(id, name) {
    setRenaming(null); // close the field at once; a failed save shows the error banner
    run(async () => {
      const updated = await api.updateFolder(id, { name });
      setFolders((prev) => prev.map((f) => (f._id === id ? updated : f)));
    });
  }

  // Drag-and-drop move: a note or folder dropped onto a folder (or the empty
  // tree area for top level / unsorted). Invalid folder moves throw to the banner.
  function handleMove(kind, id, target) {
    run(async () => {
      if (kind === "note") {
        const note = notes.find((n) => n._id === id);
        const cur = note?.folderId?._id || note?.folderId || null;
        if (String(cur || "") === String(target || "")) return;
        await api.updateNote(id, { folderId: target });
      } else if (kind === "file") {
        const file = files.find((f) => f._id === id);
        const cur = file?.folderId?._id || file?.folderId || null;
        if (String(cur || "") === String(target || "")) return;
        await api.updateFile(id, { folderId: target });
      } else {
        const folder = folders.find((f) => f._id === id);
        const cur = folder?.parentId?._id || folder?.parentId || null;
        if (String(cur || "") === String(target || "")) return;
        if (target) {
          let cur2 = folders.find((f) => String(f._id) === String(target));
          while (cur2) {
            if (String(cur2._id) === String(id))
              throw new Error("Cannot move a folder into itself or its subfolder");
            const pid = cur2.parentId?._id || cur2.parentId || null;
            cur2 = pid ? folders.find((f) => String(f._id) === String(pid)) : null;
          }
        }
        await api.updateFolder(id, { parentId: target });
      }
      await refresh();
    });
  }

  function handleNewFolder(parentId) {
    run(async () => {
      const folder = await api.createFolder("New Folder", parentId);
      setFolders((prev) => [...prev, folder]);
      setRenaming({ kind: "folder", id: folder._id });
    });
  }

  function handleDeleteFolder(id, name) {
    setDeletingFolder({ id, name });
  }

  function confirmDeleteFolder() {
    const { id } = deletingFolder;
    setDeletingFolder(null);
    run(async () => {
      await api.deleteFolder(id);
      await refresh(); // folderIds changed, refresh the lists
    });
  }

  function handleSaveNote(id, payload) {
    return run(async () => {
      const updated = await api.updateNote(id, payload);
      setNotes((prev) => prev.map((n) => (n._id === id ? updated : n)));
      // Auto-sort: an unsorted note is filed by AI right after a manual save.
      // Locked notes are never auto-sorted.
      const folderId = updated.folderId?._id || updated.folderId || null;
      if (settings.autoSort && !folderId && !updated.locked) autoSortNote(id, updated.title);
    });
  }

  // The sidebar Auto Sort button asks for confirmation first (unless the
  // user checked "don't show again"), because it moves many items at once.
  function requestSortAll() {
    if (sorting) return;
    if (localStorage.getItem("ui.autoSortAsk") === "false") handleSortAll();
    else {
      setSortDontShow(false);
      setSortConfirm(true);
    }
  }

  function confirmSortAll() {
    if (sortDontShow) localStorage.setItem("ui.autoSortAsk", "false");
    setSortConfirm(false);
    handleSortAll();
  }

  // Toggles the AI-sorting lock on a note or folder. Locked items are
  // invisible to every auto-sort path (single, bulk, and creation).
  function handleToggleLock(kind, id, locked) {
    run(async () => {
      if (kind === "note") {
        const updated = await api.updateNote(id, { locked });
        setNotes((prev) => prev.map((n) => (n._id === id ? updated : n)));
      } else {
        const updated = await api.updateFolder(id, { locked });
        setFolders((prev) => prev.map((f) => (f._id === id ? updated : f)));
      }
    });
  }

  // Files every unsorted, unlocked note and upload into folders with AI, one by one.
  function handleSortAll() {
    const unsortedNotes = notes.filter((n) => !n.folderId && !n.locked);
    const unsortedFiles = files.filter((f) => !f.folderId);
    const total = unsortedNotes.length + unsortedFiles.length;
    if (total === 0 || sorting) return;
    run(async () => {
      setSorting({ done: 0, total });
      let failed = 0;
      const step = () => setSorting((s) => s && { done: s.done + 1, total: s.total });
      try {
        for (const n of unsortedNotes) {
          try {
            await api.organize(n._id);
          } catch {
            failed++;
          }
          step();
        }
        for (const f of unsortedFiles) {
          try {
            await api.organizeFile(f._id);
          } catch {
            failed++;
          }
          step();
        }
      } finally {
        setSorting(null);
        await refresh();
      }
      if (failed > 0) setError(`${failed} item(s) could not be sorted`);
    });
  }

  function handleDeleteNote(id, title) {
    setDeletingNote({ id, title });
  }

  // Files dropped onto a folder (or picked via the sidebar button) upload
  // straight into that folder; binaries land in MongoDB. Markdown uploads
  // come back as real notes and open in a tab like created notes.
  function handleUploadFiles(fileList, folderId) {
    run(async () => {
      const results = await api.uploadFiles(fileList, folderId);
      const newFiles = results.map((r) => r.file).filter(Boolean);
      const newNotes = results.map((r) => r.note).filter(Boolean);
      if (newFiles.length > 0) setFiles((prev) => [...newFiles, ...prev]);
      if (newNotes.length > 0) {
        setNotes((prev) => [...newNotes, ...prev]);
        openTab(newNotes[newNotes.length - 1]._id);
      }
    });
  }

  function handleRenameFile(id, name) {
    setRenaming(null); // close the field at once; a failed save shows the error banner
    run(async () => {
      const updated = await api.updateFile(id, { name });
      setFiles((prev) => prev.map((f) => (f._id === id ? updated : f)));
    });
  }

  // Editing a .md / .txt file tab saves its text back into MongoDB.
  function handleSaveFileContent(id, content) {
    return run(async () => {
      const updated = await api.updateFile(id, { content });
      setFiles((prev) => prev.map((f) => (f._id === id ? updated : f)));
    });
  }

  // Tag edits (notes save with Save; files save instantly) — returns the update.
  function handleSaveFileTags(id, tags) {
    return run(async () => {
      const updated = await api.updateFile(id, { tags });
      setFiles((prev) => prev.map((f) => (f._id === id ? updated : f)));
      return updated;
    });
  }

  function handleDeleteFile(id, name) {
    setDeletingFile({ id, name });
  }

  function confirmDeleteFile() {
    const { id } = deletingFile;
    setDeletingFile(null);
    closeTab(`file:${id}`);
    run(async () => {
      await api.deleteFile(id);
      setFiles((prev) => prev.filter((f) => f._id !== id));
    });
  }

  function confirmDeleteNote() {
    const { id } = deletingNote;
    setDeletingNote(null);
    closeTab(id);
    run(async () => {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n._id !== id));
    });
  }

  function handleAttach(noteId, file) {
    return run(async () => {
      const { note } = await api.upload(file, noteId);
      setNotes((prev) => prev.map((n) => (n._id === noteId ? note : n)));
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
    <div className="flex h-screen flex-col text-neutral-200">
      {/* Top navbar: logo - homepage - search - settings - left toggle - tabs - right toggle */}
      <header
        className="glass pane-top relative flex h-11 shrink-0 items-center gap-1 px-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleNavbarDrop}
      >
        <NavButton
          title="Home"
          active={view === "notes" && !activeId}
          onClick={() => {
            // Home goes to notes: the active tab if there is one,
            // otherwise the Assistant. Never clears the tab position,
            // so Dashboard -> Home resumes where you left off.
            if (!activeId && tabs.length > 0) setActiveId(tabs[tabs.length - 1]);
            setView("notes");
          }}
        >
          <LuHouse size={17} />
        </NavButton>
        <NavButton title="Dashboard" active={view === "dashboard"} onClick={() => setView("dashboard")}>
          <LuLayoutDashboard size={17} />
        </NavButton>
        <NavButton title="Knowledge graph" active={view === "graph"} onClick={() => setView("graph")}>
          <LuWaypoints size={17} />
        </NavButton>
        <NavButton
          title="Search notes"
          active={searchOpen}
          onClick={(e) => {
            if (searchOpen) {
              setSearchOpen(false);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setSearchAnchor({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 336) });
            setSearchOpen(true);
          }}
        >
          <LuSearch size={17} />
        </NavButton>
        <NavButton title="Browse tags" active={tagsOpen} onClick={() => setTagsOpen((v) => !v)}>
          <LuTag size={17} />
        </NavButton>
        <NavButton title="Settings" active={settingsOpen} onClick={() => setSettingsOpen(true)}>
          <LuSettings size={17} />
        </NavButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <NavButton title={leftOpen ? "Close left sidebar" : "Open left sidebar"} onClick={() => setLeftOpen((v) => !v)}>
          {leftOpen ? <LuPanelLeftClose size={17} /> : <LuPanelLeftOpen size={17} />}
        </NavButton>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
          {tabs.map((id) => {
            const fileTab = isFileTab(id);
            const t = fileTab
              ? files.find((f) => f._id === fileIdOf(id))
              : notes.find((n) => n._id === id);
            const active = id === activeId && view === "notes";
            const dirty = dirtyIds.includes(id);
            const preview = id === previewId;
            return (
              <div
                key={id}
                onClick={() => {
                  setActiveId(id);
                  setView("notes");
                }}
                className={`group flex max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ${
                  active ? `${acc.softBgStrong} ${acc.softText}` : "text-neutral-400 hover:bg-white/5"
                } ${preview ? "italic" : ""}`}
              >
                {fileTab ? (
                  <FileTypeIcon mime={t?.mimeType} size={13} />
                ) : (
                  <LuFileText size={13} className="shrink-0 text-neutral-500" />
                )}
                <span className="truncate">{fileTab ? t?.name || "File" : t?.title || "Note"}</span>
                {dirty ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestCloseTab(id);
                    }}
                    title="Unsaved changes — click to close"
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
                  >
                    <span className={`h-2 w-2 rounded-full ${acc.progress}`} />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      requestCloseTab(id);
                    }}
                    title="Close tab"
                    className={`flex shrink-0 items-center rounded p-0.5 hover:bg-white/10 hover:text-neutral-100 ${
                      active ? "text-neutral-300" : "text-neutral-600 opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <LuX size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {/* The right panel only exists while a tab is open; the Assistant
            in the center makes it redundant, so the toggle hides too. */}
        {centerHasTab && (
          <NavButton title={rightOpen ? "Close right sidebar" : "Open right sidebar"} onClick={() => setRightOpen((v) => !v)}>
            {rightOpen ? <LuPanelRightClose size={17} /> : <LuPanelRightOpen size={17} />}
          </NavButton>
        )}
        <img
          src={logoSrc}
          alt="Lumia Notes"
          title="Lumia Notes"
          className="ml-3 h-6 w-auto shrink-0 select-none"
          draggable={false}
        />
      </header>

      <div className="flex min-h-0 flex-1">
      {/* Left: folders + notes (width animates; content keeps its size inside) */}
      <aside
        className={`glass pane-left shrink-0 overflow-hidden ${
          draggingPane ? "" : "pane-x"
        } ${leftOpen ? "" : "pointer-events-none"}`}
        style={{ width: leftOpen ? sidebarW : 0 }}
        aria-hidden={!leftOpen}
      >
        <div className="h-full" style={{ width: sidebarW }}>
        <Sidebar
          folders={folders}
          notes={notes}
          files={files}
          selectedNoteId={activeId}
          selectedFileId={isFileTab(activeId) ? fileIdOf(activeId) : null}
          onSelectNote={handleSelectNote}
          onSelectFile={handleSelectFile}
          onNewNote={handleNewNote}
          onNewFolder={handleNewFolder}
          onUploadFiles={handleUploadFiles}
          onDeleteFolder={handleDeleteFolder}
          onDeleteNote={handleDeleteNote}
          onDeleteFile={handleDeleteFile}
          renaming={renaming}
          onRenameStart={(kind, id) => setRenaming({ kind, id })}
          onRenameNote={handleRenameNote}
          onRenameFolder={handleRenameFolder}
          onRenameFile={handleRenameFile}
          onRenameCancel={() => setRenaming(null)}
          onMove={handleMove}
          onSortAll={requestSortAll}
          onToggleLock={handleToggleLock}
          sorting={sorting}
        />
        </div>
      </aside>
      {leftOpen && (
        <Resizer
          onResize={(dx) => setSidebarW((w) => Math.min(480, Math.max(180, w + dx)))}
          onDragStart={() => setDraggingPane(true)}
          onDragEnd={() => setDraggingPane(false)}
        />
      )}

      {/* Center: wide AI panel when no tab is open, editor otherwise */}
      <main className="glass pane-center flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === "dashboard" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Dashboard />
          </div>
        ) : view === "graph" ? (
          <div className="min-h-0 flex-1">
            <GraphView onOpenNote={handleSelectNote} />
          </div>
        ) : tabs.length > 0 ? (
          // Every open tab keeps its own mounted editor (hidden when inactive),
          // so unsaved drafts survive tab switches — VS Code style.
          tabs.map((id) => {
            const isActive = id === activeId;
            if (isFileTab(id)) {
              const f = files.find((x) => x._id === fileIdOf(id));
              if (!f) return null;
              return (
                <div key={id} className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                  <FileViewer
                    file={f}
                    active={isActive}
                    onSaveContent={handleSaveFileContent}
                    onSaveTags={handleSaveFileTags}
                    onDelete={handleDeleteFile}
                  />
                </div>
              );
            }
            const n = notes.find((x) => x._id === id);
            if (!n) return null;
            return (
              <div key={id} className={isActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                <NoteEditor
                  note={n}
                  active={isActive}
                  onSave={handleSaveNote}
                  onDelete={handleDeleteNote}
                  onAttach={handleAttach}
                  onDirtyChange={(dirty) => handleDirtyChange(n._id, dirty)}
                  onOpenWikiLink={handleOpenWikiLink}
                />
              </div>
            );
          })
        ) : (
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
            <AiPanel
              onChanged={() => run(refresh)}
              variant="home"
              notes={notes}
              folders={folders}
              files={files}
              defaultModel={settings.defaultModel}
              showAttachments={settings.showChatAttachments}
            />
          </div>
        )}
      </main>

      {/* Right: narrow AI panel while a tab is open (width animates) */}
      {centerHasTab && (
        <>
        {rightOpen && (
          <Resizer
            onResize={(dx) => setRightW((w) => Math.min(560, Math.max(240, w - dx)))}
            onDragStart={() => setDraggingPane(true)}
            onDragEnd={() => setDraggingPane(false)}
          />
        )}
        <aside
          className={`glass pane-right shrink-0 overflow-hidden ${
            draggingPane ? "" : "pane-x"
          } ${rightOpen ? "" : "pointer-events-none"}`}
          style={{ width: rightOpen ? rightW : 0 }}
          aria-hidden={!rightOpen}
        >
          <div className="h-full" style={{ width: rightW }}>
            <AiPanel
              onChanged={() => run(refresh)}
              notes={notes}
              folders={folders}
              files={files}
              defaultModel={settings.defaultModel}
              showAttachments={settings.showChatAttachments}
            />
          </div>
        </aside>
        </>
      )}

      </div>

      {/* Search dropdown (portal: immune to the navbar's backdrop-filter context) */}
      {searchOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />
            <div
              className="glass pop-in fixed z-50 w-80 overflow-hidden rounded-xl p-2"
              style={{ top: searchAnchor?.top ?? 60, left: searchAnchor?.left ?? 8 }}
            >
              <input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Search notes..."
                className={`w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 ${acc.focusBorder} focus:outline-none`}
              />
              <div className="mt-1 max-h-64 overflow-y-auto">
                {!sq ? (
                  <p className="px-2 py-3 text-center text-xs text-neutral-600">
                    Type to search across all notes.
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-neutral-600">No matches.</p>
                ) : (
                  searchResults.map((n) => (
                    <button
                      key={n._id}
                      onClick={() => {
                        openTab(n._id);
                        setSearchOpen(false);
                        setSearchQ("");
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-neutral-300 ${acc.softHover}`}
                    >
                      <LuFileText size={14} className="shrink-0 text-neutral-500" />
                      <span className="truncate">{n.title}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Tags browser */}
      {tagsOpen && (
        <TagsModal
          notes={notes}
          files={files}
          onOpenNote={(id) => {
            setTagsOpen(false);
            openTab(id);
          }}
          onOpenFile={(id) => {
            setTagsOpen(false);
            openFileTab(id);
          }}
          onClose={() => setTagsOpen(false)}
        />
      )}

      {/* Settings */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
          notes={notes}
          folders={folders}
          files={files}
          onDataChanged={() => {
            setSettingsOpen(false);
            refresh();
          }}
        />
      )}

      {/* Delete-note confirm */}
      {deletingNote && (
        <Modal onClose={() => setDeletingNote(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">Delete note</h3>
              <p className="mt-1 text-sm text-neutral-400">
                "{deletingNote.title}" will be permanently deleted. Are you sure?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={close}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                >
                  Keep <Kbd>Esc</Kbd>
                </button>
                <button
                  data-modal-primary
                  onClick={confirmDeleteNote}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400/90 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-300"
                >
                  Delete <Kbd>Enter</Kbd>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Delete-file confirm */}
      {deletingFile && (
        <Modal onClose={() => setDeletingFile(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">Delete file</h3>
              <p className="mt-1 text-sm text-neutral-400">
                "{deletingFile.name}" will be permanently deleted. Are you sure?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={close}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                >
                  Keep <Kbd>Esc</Kbd>
                </button>
                <button
                  data-modal-primary
                  onClick={confirmDeleteFile}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400/90 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-300"
                >
                  Delete <Kbd>Enter</Kbd>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Delete-folder confirm */}
      {deletingFolder && (
        <Modal onClose={() => setDeletingFolder(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">Delete folder</h3>
              <p className="mt-1 text-sm text-neutral-400">
                "{deletingFolder.name}" will be deleted. Its contents are kept, they become
                unsorted. Are you sure?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={close}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                >
                  Keep <Kbd>Esc</Kbd>
                </button>
                <button
                  data-modal-primary
                  onClick={confirmDeleteFolder}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400/90 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-300"
                >
                  Delete <Kbd>Enter</Kbd>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Unsaved-tab close confirm */}
      {closingId && (
        <Modal onClose={() => setClosingId(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">Unsaved changes</h3>
              <p className="mt-1 text-sm text-neutral-400">
                "{notes.find((n) => n._id === closingId)?.title || "Note"}" has unsaved changes.
                Are you sure you want to close it without saving?
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={close}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                >
                  Keep editing <Kbd>Esc</Kbd>
                </button>
                <button
                  data-modal-primary
                  onClick={() => {
                    closeTab(closingId);
                    setClosingId(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400/90 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-300"
                >
                  Discard <Kbd>Enter</Kbd>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Auto Sort confirm: bulk filing moves many items at once */}
      {sortConfirm && (
        <Modal onClose={() => setSortConfirm(false)}>
          {(close) => {
            const n = notes.filter((x) => !x.folderId && !x.locked).length;
            const f = files.filter((x) => !x.folderId).length;
            return (
              <div className="glass w-full max-w-sm rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-neutral-100">Auto Sort everything?</h3>
                <p className="mt-1 text-sm text-neutral-400">
                  The AI will move {n} unsorted note{n === 1 ? "" : "s"} and {f} unsorted
                  file{f === 1 ? "" : "s"} into folders, creating new folders when nothing
                  fits. Notes already in folders stay untouched, and locked notes and
                  locked folders are always left alone.
                </p>
                <p className="mt-2 text-sm text-neutral-400">
                  Everything moves at once, so give important notes a quick check
                  afterwards.
                </p>
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={sortDontShow}
                    onChange={(e) => setSortDontShow(e.target.checked)}
                    style={{ accentColor: "var(--acc)" }}
                    className="h-4 w-4"
                  />
                  Don&apos;t show again
                </label>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={close}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                  >
                    Cancel <Kbd>Esc</Kbd>
                  </button>
                  <button
                    data-modal-primary
                    onClick={confirmSortAll}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${currentAccent().solid}`}
                  >
                    Continue <Kbd>Enter</Kbd>
                  </button>
                </div>
              </div>
            );
          }}
        </Modal>
      )}

      {/* Error banner */}
      {error && (
        <div className="fixed bottom-4 left-1/2 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border border-red-400/30 bg-[#17171c] px-4 py-2 text-sm text-red-200 shadow-xl">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="flex items-center text-red-300 hover:text-red-100">
            <LuX size={14} />
          </button>
        </div>
      )}

      {/* AI filing toast with Undo */}
      {toast && (
        <div
          key={toast.key}
          className="toast-in glass fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-xl"
        >
          <LuFolderCheck size={16} className={`shrink-0 ${currentAccent().text}`} />
          <span className="min-w-0">
            <span className="block truncate text-neutral-200">
              Auto Sort moved “{toast.title}” to {toast.folder}
            </span>
            <span className="block text-xs text-neutral-500">
              Turn off in Settings → Automation.
            </span>
          </span>
          <button
            onClick={undoAutoSort}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${currentAccent().solid}`}
          >
            <LuUndo2 size={13} />
            Undo
          </button>
          <button
            onClick={() => setToast(null)}
            title="Dismiss"
            className="rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <LuX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
