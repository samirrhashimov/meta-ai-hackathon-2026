import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, fileContentUrl } from "./api";
import { shortcutTitle } from "./shortcuts";
import Sidebar from "./components/Sidebar";
import NoteEditor from "./components/NoteEditor";
import FileViewer, { FileTypeIcon } from "./components/FileViewer";
const DrawingViewer = lazy(() => import("./components/DrawingViewer"));
import { blankScene, isDrawing } from "./drawings";
import TagsModal from "./components/TagsModal";
import Modal, { Kbd } from "./components/Modal";
import AiPanel from "./components/AiPanel";
import Dashboard from "./components/Dashboard";
import GraphView from "./components/GraphView";
import SettingsModal from "./components/SettingsModal";
import { loadSettings, saveSettings } from "./settings";
import { LuFileText, LuFolderCheck, LuFolderSymlink, LuHouse, LuLayoutDashboard, LuPanelLeftClose, LuPanelLeftOpen, LuPanelRightClose, LuPanelRightOpen, LuSearch, LuSettings, LuTag, LuTrash2, LuUndo2, LuWaypoints, LuX } from "react-icons/lu";
import Resizer from "./components/Resizer";
import { applyAccentVars, currentAccent } from "./accent";
import logo from "./assets/flama_icon.png";
import logoDark from "./assets/flama_icon_dark.png";

function NavButton({ title, active, onClick, children, dim, buttonRef }) {
  const acc = currentAccent();
  return (
    <button
      ref={buttonRef}
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
  const [bulkDeleting, setBulkDeleting] = useState(null); // [{ kind, id, label }] awaiting bulk delete
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false); // tags browser modal
  const [searchQ, setSearchQ] = useState("");
  const [searchAnchor, setSearchAnchor] = useState(null); // dropdown position under the button
  const searchBtnRef = useRef(null); // navbar search button, for keyboard opening
  const uploadRef = useRef(null); // hidden file picker for the upload shortcut
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
  const [sidebarW, setSidebarW] = useState(() => Number(localStorage.getItem("ui.sidebarW")) || 300);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem("ui.rightW")) || 360);
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
  // Operation toast: { key, icon, message, hint?, undo? } — auto-dismisses.
  // undo is { label, run } where run() performs the reversal.
  const [toast, setToast] = useState(null);

  function showToast(message, { icon = "sort", hint = "", undo = null } = {}) {
    setToast({ key: Date.now(), icon, message, hint, undo });
  }

  function dismissToastAndRun() {
    const u = toast?.undo;
    setToast(null);
    if (u) u.run();
  }

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

  // Global shortcuts (see shortcuts.js). Matching uses e.code (physical key)
  // so alternative layouts keep working; AltGr (Ctrl+Alt) never matches the
  // Alt-only combos. They stay active inside the note editor too.
  // Re-subscribed every render so handlers never go stale.
  useEffect(() => {
    function onKey(e) {
      if (document.querySelector(".modal-backdrop")) return; // dialogs own the keyboard
      const mod = e.ctrlKey || e.metaKey;
      const c = e.code;
      if (!mod && e.altKey && !e.shiftKey && c === "KeyN") {
        e.preventDefault();
        handleNewNote();
      } else if (!mod && e.altKey && e.shiftKey && c === "KeyN") {
        e.preventDefault();
        handleNewFolder(null);
      } else if (!mod && e.altKey && !e.shiftKey && c === "KeyS") {
        e.preventDefault();
        requestSortAll();
      } else if (mod && !e.altKey && !e.shiftKey && c === "KeyB") {
        e.preventDefault();
        setLeftOpen((v) => !v);
      } else if (mod && !e.altKey && !e.shiftKey && c === "KeyJ") {
        e.preventDefault();
        setRightOpen((v) => !v);
      } else if (mod && !e.altKey && !e.shiftKey && c === "KeyK") {
        e.preventDefault();
        toggleSearchKb();
      } else if (mod && !e.altKey && c === "Comma") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (!mod && e.altKey && !e.shiftKey && c === "Digit1") {
        e.preventDefault();
        goHome();
      } else if (!mod && e.altKey && !e.shiftKey && c === "Digit2") {
        e.preventDefault();
        setView("dashboard");
      } else if (!mod && e.altKey && !e.shiftKey && c === "Digit3") {
        e.preventDefault();
        setView("graph");
      } else if (!mod && e.altKey && !e.shiftKey && c === "KeyT") {
        e.preventDefault();
        setTagsOpen((v) => !v);
      } else if (!mod && e.altKey && !e.shiftKey && c === "KeyU") {
        e.preventDefault();
        uploadRef.current?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  // Home goes to notes: the active tab if there is one, otherwise the
  // Assistant. Never clears the tab position, so Dashboard -> Home resumes
  // where you left off.
  function goHome() {
    if (!activeId && tabs.length > 0) setActiveId(tabs[tabs.length - 1]);
    setView("notes");
  }

  // Search toggle shared by the navbar button and the Ctrl+K shortcut.
  // Keyboard opening anchors the dropdown under the navbar search button.
  function toggleSearchKb() {
    setSearchOpen((open) => {
      if (open) return false;
      const r = searchBtnRef.current?.getBoundingClientRect();
      if (r) setSearchAnchor({ top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 336) });
      return true;
    });
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
          const snap = { noteId: id, folderId: result.folder._id, created: result.created };
          showToast(`Auto Sort moved “${title || "Note"}” to ${name}`, {
            hint: "Turn off in Settings → Automation.",
            undo: { label: "Undo", run: () => undoAutoSort(snap) },
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
  function undoAutoSort(t) {
    return run(async () => {
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
  // Drag-and-drop move (single item) with an Undo toast.
  function handleMove(kind, id, target) {
    run(async () => {
      const item =
        kind === "note"
          ? notes.find((n) => n._id === id)
          : kind === "file"
            ? files.find((f) => f._id === id)
            : folders.find((f) => f._id === id);
      const key = kind === "folder" ? "parentId" : "folderId";
      const cur = item?.[key]?._id || item?.[key] || null;
      if (String(cur || "") === String(target || "")) return;
      if (kind === "note") {
        await api.updateNote(id, { folderId: target });
      } else if (kind === "file") {
        await api.updateFile(id, { folderId: target });
      } else {
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
      const label = kind === "note" ? item?.title : item?.name;
      const dest =
        kind === "folder"
          ? target
            ? folders.find((f) => String(f._id) === String(target))?.name || "a folder"
            : "top level"
          : target
            ? folders.find((f) => String(f._id) === String(target))?.name || "a folder"
            : "Unsorted";
      const prev = cur;
      showToast(`Moved “${label || "item"}” to ${dest}`, {
        icon: "move",
        undo: {
          label: "Undo",
          run: () =>
            run(async () => {
              if (kind === "note") await api.updateNote(id, { folderId: prev });
              else if (kind === "file") await api.updateFile(id, { folderId: prev });
              else await api.updateFolder(id, { parentId: prev });
              await refresh();
            }),
        },
      });
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
    // Snapshot the folder and its direct contents: deletion orphans them to
    // the top level, so Undo rebuilds the folder and files back whoever is
    // still orphaned.
    const snapF = folders.find((f) => String(f._id) === String(id));
    const snap = snapF
      ? {
          name: snapF.name,
          parentId: snapF.parentId?._id || snapF.parentId || null,
          locked: !!snapF.locked,
          noteIds: notes.filter((n) => String(n.folderId?._id || n.folderId || "") === String(id)).map((n) => n._id),
          fileIds: files.filter((f) => String(f.folderId?._id || f.folderId || "") === String(id)).map((f) => f._id),
          subIds: folders.filter((f) => String(f.parentId?._id || f.parentId || "") === String(id)).map((f) => f._id),
        }
      : null;
    setDeletingFolder(null);
    run(async () => {
      await api.deleteFolder(id);
      await refresh(); // folderIds changed, refresh the lists
      if (snap) {
        showToast(`Deleted folder “${snap.name}”`, {
          icon: "delete",
          hint: "Its contents were kept as unsorted.",
          undo: {
            label: "Undo",
            run: () =>
              run(async () => {
                const folder = await api.createFolder(snap.name, snap.parentId);
                if (snap.locked) await api.updateFolder(folder._id, { locked: true });
                const fresh = await Promise.all([api.listNotes(), api.listFiles(), api.listFolders()]);
                const [freshNotes, freshFiles, freshFolders] = fresh;
                for (const nid of snap.noteIds) {
                  const n = freshNotes.find((n) => String(n._id) === String(nid));
                  if (n && !n.folderId) await api.updateNote(nid, { folderId: folder._id });
                }
                for (const fid of snap.fileIds) {
                  const f = freshFiles.find((f) => String(f._id) === String(fid));
                  if (f && !f.folderId) await api.updateFile(fid, { folderId: folder._id });
                }
                for (const sid of snap.subIds) {
                  const s = freshFolders.find((f) => String(f._id) === String(sid));
                  if (s && !s.parentId) await api.updateFolder(sid, { parentId: folder._id });
                }
                await refresh();
              }),
          },
        });
      }
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

  // New drawings are .excalidraw scene files in MongoDB: created like notes
  // (opened in a tab, rename focused), stored and edited like files.
  function handleNewDrawing(folderId = null) {
    run(async () => {
      const scene = new File([JSON.stringify(blankScene(), null, 2)], "Untitled drawing.excalidraw", {
        type: "application/json",
      });
      const results = await api.uploadFiles([scene], folderId);
      const created = results.map((r) => r.file).filter(Boolean)[0];
      if (!created) throw new Error("Upload failed");
      setFiles((prev) => [created, ...prev]);
      openFileTab(created._id);
      setRenaming({ kind: "file", id: created._id });
    });
  }

  // Downloads a file's bytes for a restorable delete snapshot (best effort).
  async function snapshotFileBytes(id) {
    try {
      const res = await fetch(fileContentUrl(id));
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }

  function confirmDeleteFile() {
    const { id } = deletingFile;
    const snap = files.find((f) => f._id === id);
    setDeletingFile(null);
    closeTab(`file:${id}`);
    run(async () => {
      const blob = await snapshotFileBytes(id);
      await api.deleteFile(id);
      setFiles((prev) => prev.filter((f) => f._id !== id));
      if (snap) {
        const meta = {
          name: snap.name,
          folderId: snap.folderId?._id || snap.folderId || null,
          type: snap.mimeType || "application/octet-stream",
        };
        showToast(`Deleted “${snap.name}”`, {
          icon: "delete",
          undo: blob
            ? {
                label: "Undo",
                run: () =>
                  run(async () => {
                    await api.uploadFiles([new File([blob], meta.name, { type: meta.type })], meta.folderId);
                    await refresh();
                  }),
              }
            : null,
        });
      }
    });
  }

  function confirmDeleteNote() {
    const { id } = deletingNote;
    const snap = notes.find((n) => n._id === id);
    setDeletingNote(null);
    closeTab(id);
    run(async () => {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n._id !== id));
      if (snap) {
        const data = {
          title: snap.title,
          content: snap.content || "",
          folderId: snap.folderId?._id || snap.folderId || null,
          tags: snap.tags || [],
        };
        showToast(`Deleted “${snap.title}”`, {
          icon: "delete",
          undo: {
            label: "Undo",
            run: () =>
              run(async () => {
                await api.createNote(data);
                await refresh();
              }),
          },
        });
      }
    });
  }

  // Bulk actions from the sidebar multi-selection. Each returns the run()
  // promise so the sidebar can clear its selection when the work is done.
  function handleBulkDelete(items) {
    // Opens the confirm modal; the sidebar clears its selection right away
    // while the modal names what will be deleted.
    setBulkDeleting(items);
    return Promise.resolve();
  }

  function confirmBulkDelete() {
    const items = bulkDeleting || [];
    setBulkDeleting(null);
    for (const x of items) {
      if (x.kind === "note") closeTab(x.id);
      else closeTab(`file:${x.id}`);
    }
    return run(async () => {
      // Snapshot everything first (file bytes included) so Undo can rebuild.
      const snaps = await Promise.all(
        items.map(async (x) => {
          if (x.kind === "note") {
            const n = notes.find((n) => n._id === x.id);
            return n
              ? { kind: "note", data: { title: n.title, content: n.content || "", folderId: n.folderId?._id || n.folderId || null, tags: n.tags || [] } }
              : null;
          }
          const f = files.find((f) => f._id === x.id);
          if (!f) return null;
          return {
            kind: "file",
            data: { name: f.name, folderId: f.folderId?._id || f.folderId || null, type: f.mimeType || "application/octet-stream" },
            blob: await snapshotFileBytes(x.id),
          };
        })
      );
      for (const x of items) {
        if (x.kind === "note") await api.deleteNote(x.id);
        else await api.deleteFile(x.id);
      }
      const noteIds = new Set(items.filter((x) => x.kind === "note").map((x) => x.id));
      const fileIds = new Set(items.filter((x) => x.kind === "file").map((x) => x.id));
      setNotes((prev) => prev.filter((n) => !noteIds.has(n._id)));
      setFiles((prev) => prev.filter((f) => !fileIds.has(f._id)));
      const restorable = snaps.filter(Boolean);
      if (restorable.length > 0) {
        const skipped = restorable.filter((s) => s.kind === "file" && !s.blob).length;
        showToast(`Deleted ${restorable.length} item${restorable.length === 1 ? "" : "s"}`, {
          icon: "delete",
          hint: skipped > 0 ? `${skipped} file${skipped === 1 ? "" : "s"} can't be restored` : "",
          undo: {
            label: "Undo",
            run: () =>
              run(async () => {
                for (const s of restorable) {
                  if (s.kind === "note") await api.createNote(s.data);
                  else if (s.blob)
                    await api.uploadFiles([new File([s.blob], s.data.name, { type: s.data.type })], s.data.folderId);
                }
                await refresh();
              }),
          },
        });
      }
    });
  }

  function handleBulkMove(items, folderId) {
    // selItems() already carries each item's previous folderId.
    const prevs = items.map((x) => ({ kind: x.kind, id: x.id, prev: x.folderId || null }));
    return run(async () => {
      for (const x of items) {
        if (x.kind === "note") await api.updateNote(x.id, { folderId });
        else await api.updateFile(x.id, { folderId });
      }
      await refresh();
      const dest = folderId
        ? folders.find((f) => String(f._id) === String(folderId))?.name || "a folder"
        : "Unsorted";
      showToast(`Moved ${items.length} item${items.length === 1 ? "" : "s"} to ${dest}`, {
        icon: "move",
        undo: {
          label: "Undo",
          run: () =>
            run(async () => {
              for (const p of prevs) {
                if (p.kind === "note") await api.updateNote(p.id, { folderId: p.prev });
                else await api.updateFile(p.id, { folderId: p.prev });
              }
              await refresh();
            }),
        },
      });
    });
  }

  function handleBulkLock(items, locked) {
    return run(async () => {
      for (const x of items) {
        if (x.kind !== "note") continue;
        const updated = await api.updateNote(x.id, { locked });
        setNotes((prev) => prev.map((n) => (n._id === x.id ? updated : n)));
      }
    });
  }

  function handleBulkSort(noteIds) {
    const targets = notes.filter((n) => noteIds.includes(n._id) && !n.folderId && !n.locked);
    if (targets.length === 0) return Promise.resolve();
    return run(async () => {
      setSorting({ done: 0, total: targets.length });
      try {
        for (const n of targets) {
          try {
            await api.organize(n._id);
          } catch {
            // one failure must not stop the rest; errors surface per-note otherwise
          }
          setSorting((s) => s && { done: s.done + 1, total: s.total });
        }
      } finally {
        setSorting(null);
        await refresh();
      }
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
      {/* Hidden picker for the Upload shortcut (Alt+U): drops into Unsorted. */}
      <input
        ref={uploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleUploadFiles([...e.target.files], null);
          e.target.value = "";
        }}
      />
      {/* Top navbar: logo - homepage - search - settings - left toggle - tabs - right toggle */}
      <header
        className="glass pane-top relative flex h-11 shrink-0 items-center gap-1 px-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleNavbarDrop}
      >
        <NavButton
          title={shortcutTitle("Home", "home")}
          active={view === "notes" && !activeId}
          onClick={goHome}
        >
          <LuHouse size={17} />
        </NavButton>
        <NavButton title={shortcutTitle("Dashboard", "dashboard")} active={view === "dashboard"} onClick={() => setView("dashboard")}>
          <LuLayoutDashboard size={17} />
        </NavButton>
        <NavButton title={shortcutTitle("Knowledge graph", "graph")} active={view === "graph"} onClick={() => setView("graph")}>
          <LuWaypoints size={17} />
        </NavButton>
        <NavButton
          title={shortcutTitle("Search notes", "search")}
          active={searchOpen}
          buttonRef={searchBtnRef}
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
        <NavButton title={shortcutTitle("Browse tags", "tags")} active={tagsOpen} onClick={() => setTagsOpen((v) => !v)}>
          <LuTag size={17} />
        </NavButton>
        <NavButton title={shortcutTitle("Settings", "settings")} active={settingsOpen} onClick={() => setSettingsOpen(true)}>
          <LuSettings size={17} />
        </NavButton>
        <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <NavButton title={shortcutTitle(leftOpen ? "Close left sidebar" : "Open left sidebar", "toggle-sidebar")} onClick={() => setLeftOpen((v) => !v)}>
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
                  <FileTypeIcon mime={t?.mimeType} name={t?.name} size={13} />
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
          <NavButton title={shortcutTitle(rightOpen ? "Close right sidebar" : "Open right sidebar", "assistant")} onClick={() => setRightOpen((v) => !v)}>
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
          onNewDrawing={handleNewDrawing}
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
          onBulkDelete={handleBulkDelete}
          onBulkMove={handleBulkMove}
          onBulkLock={handleBulkLock}
          onBulkSort={handleBulkSort}
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
                  {isDrawing(f) ? (
                    <Suspense
                      fallback={
                        <div className="flex min-h-0 flex-1 items-center justify-center">
                          <p className="text-sm text-neutral-600">Loading editor…</p>
                        </div>
                      }
                    >
                      <DrawingViewer
                        file={f}
                        active={isActive}
                        theme={settings.theme}
                        onSaveContent={handleSaveFileContent}
                        onSaveTags={handleSaveFileTags}
                        onDelete={handleDeleteFile}
                        onDirtyChange={(d) => handleDirtyChange(id, d)}
                      />
                    </Suspense>
                  ) : (
                    <FileViewer
                      file={f}
                      active={isActive}
                      onSaveContent={handleSaveFileContent}
                      onSaveTags={handleSaveFileTags}
                      onDelete={handleDeleteFile}
                    />
                  )}
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white"
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white"
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white"
                >
                  Delete <Kbd>Enter</Kbd>
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Bulk delete confirm */}
      {bulkDeleting && (
        <Modal onClose={() => setBulkDeleting(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">
                Delete {bulkDeleting.length} item{bulkDeleting.length === 1 ? "" : "s"}
              </h3>
              <p className="mt-1 truncate text-sm text-neutral-400">
                {bulkDeleting
                  .slice(0, 3)
                  .map((x) => x.label)
                  .join(", ")}
                {bulkDeleting.length > 3 && ` and ${bulkDeleting.length - 3} more`}
              </p>
              <p className="mt-1 text-sm text-neutral-400">
                will be permanently deleted. Are you sure?
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
                  onClick={confirmBulkDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white"
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
                "{notes.find((n) => n._id === closingId)?.title ||
                  files.find((f) => `file:${f._id}` === closingId)?.name ||
                  "Note"}" has unsaved changes.
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white"
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

      {/* Operation toast with Undo */}
      {toast && (
        <div
          key={toast.key}
          className="toast-in glass fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-xl"
        >
          {toast.icon === "delete" ? (
            <LuTrash2 size={16} className="shrink-0 danger-text" />
          ) : toast.icon === "move" ? (
            <LuFolderSymlink size={16} className={`shrink-0 ${currentAccent().text}`} />
          ) : (
            <LuFolderCheck size={16} className={`shrink-0 ${currentAccent().text}`} />
          )}
          <span className="min-w-0">
            <span className="block truncate text-neutral-200">{toast.message}</span>
            {toast.hint && (
              <span className="block truncate text-xs text-neutral-500">{toast.hint}</span>
            )}
          </span>
          {toast.undo && (
            <button
              onClick={dismissToastAndRun}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${currentAccent().solid}`}
            >
              <LuUndo2 size={13} />
              {toast.undo.label || "Undo"}
            </button>
          )}
          <button
            onClick={() => setToast(null)}
            title="Dismiss"
            className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
          >
            <LuX size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
