import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LuArrowDownAZ,
  LuArrowDownWideNarrow,
  LuArrowUpZA,
  LuChevronDown,
  LuChevronRight,
  LuChevronsDownUp,
  LuChevronsUpDown,
  LuClock,
  LuDownload,
  LuExternalLink,
  LuFilePlus,
  LuFileText,
  LuFolder,
  LuFolderOpen,
  LuFolderPlus,
  LuHistory,
  LuInfo,
  LuPencil,
  LuPlus,
  LuSparkles,
  LuTrash2,
  LuUpload,
} from "react-icons/lu";
import { fileContentUrl } from "../api";
import { FileTypeIcon } from "./FileViewer";

function formatSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

// Browser download of a MongoDB-stored file.
function downloadFile(file) {
  const a = document.createElement("a");
  a.href = fileContentUrl(file._id);
  a.download = file.name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Left panel: folder tree + note list + search.
// Folders and notes are managed through the right-click menu.
export default function Sidebar({
  folders,
  notes,
  files,
  selectedNoteId,
  selectedFileId,
  onSelectNote,
  onSelectFile,
  onNewNote,
  onNewFolder,
  onUploadFiles,
  onDeleteFolder,
  onDeleteNote,
  onDeleteFile,
  renaming,
  onRenameStart,
  onRenameNote,
  onRenameFolder,
  onRenameFile,
  onRenameCancel,
  onMove,
  onSortAll,
  sorting,
}) {
  const fileInputRef = useRef(null);
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [showInfo, setShowInfo] = useState(null); // file awaiting info view
  const [dragOver, setDragOver] = useState(null); // folderId currently hovered while dragging
  const [sortBy, setSortBy] = useState(() => localStorage.getItem("ui.sortBy") || "created");

  useEffect(() => {
    localStorage.setItem("ui.sortBy", sortBy);
  }, [sortBy]);

  const SORTS = {
    created: { label: "Created date", fn: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0) },
    updated: { label: "Last modified", fn: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) },
    az: { label: "Name A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    za: { label: "Name Z–A", fn: (a, b) => b.title.localeCompare(a.title) },
  };

  const orderedNotes = [...notes].sort(SORTS[sortBy]?.fn || SORTS.created.fn);
  const folderFn =
    sortBy === "az"
      ? (a, b) => a.name.localeCompare(b.name)
      : sortBy === "za"
        ? (a, b) => b.name.localeCompare(a.name)
        : sortBy === "updated"
          ? (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
          : (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  const notesByFolder = {};
  for (const n of orderedNotes) {
    const key = n.folderId?._id || n.folderId || "unfiled";
    if (!notesByFolder[key]) notesByFolder[key] = [];
    notesByFolder[key].push(n);
  }

  const rootFolders = folders.filter((f) => !f.parentId).sort(folderFn);
  const unfiled = notesByFolder.unfiled || [];
  const unfiledCount = unfiled.length;

  // Files grouped by folder, sorted with the same sort mode (by name for A-Z).
  const fileFn =
    sortBy === "az"
      ? (a, b) => a.name.localeCompare(b.name)
      : sortBy === "za"
        ? (a, b) => b.name.localeCompare(a.name)
        : sortBy === "updated"
          ? (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
          : (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  const filesByFolder = {};
  for (const f of [...(files || [])].sort(fileFn)) {
    const key = f.folderId ? String(f.folderId._id || f.folderId) : "unfiled";
    if (!filesByFolder[key]) filesByFolder[key] = [];
    filesByFolder[key].push(f);
  }
  const unfiledFiles = filesByFolder.unfiled || [];

  const [treeSignal, setTreeSignal] = useState(null); // { open, n } for expand/collapse all
  const [allOpen, setAllOpen] = useState(true);
  const [reveal, setReveal] = useState(null); // { ids, n } ancestors to force open

  // Ancestor chain of a note (for reveal).
  function ancestorIds(noteId) {
    const t = notes.find((n) => n._id === noteId);
    let fid = t?.folderId?._id || t?.folderId || null;
    const ids = [];
    while (fid) {
      ids.push(String(fid));
      const f = folders.find((x) => String(x._id) === String(fid));
      fid = f?.parentId?._id || f?.parentId || null;
    }
    return ids;
  }

  // Folder ancestor chain, used to reveal renaming items.
  function chainFrom(startFid) {
    const ids = [];
    let fid = startFid;
    while (fid) {
      ids.push(String(fid));
      const f = folders.find((x) => String(x._id) === String(fid));
      fid = f?.parentId?._id || f?.parentId || null;
    }
    return ids;
  }

  // Reveal the renaming item so its input is visible (transient, always on).
  useEffect(() => {
    if (!renaming) return;
    let ids;
    if (renaming.kind === "folder") {
      const t = folders.find((f) => String(f._id) === String(renaming.id));
      ids = chainFrom(t?.parentId?._id || t?.parentId || null);
    } else if (renaming.kind === "file") {
      const t = (files || []).find((x) => String(x._id) === String(renaming.id));
      ids = chainFrom(t?.folderId?._id || t?.folderId || null);
    } else {
      ids = ancestorIds(renaming.id);
    }
    setReveal((r) => ({ ids, n: (r?.n || 0) + 1 }));
  }, [renaming]);

  function openMenu(e, items) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: Math.min(e.clientX, window.innerWidth - 200),
      y: Math.min(e.clientY, window.innerHeight - items.length * 36 - 16),
      items,
    });
  }

  function closeMenu() {
    setMenu(null);
  }

  function startDrag(e, payload) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  }

  function readDrop(e) {
    try {
      return JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return null;
    }
  }

  function handleFolderDragOver(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types?.includes("Files") ? "copy" : "move";
    setDragOver(folderId);
  }

  function handleDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
  }

  function clearDragOver() {
    setDragOver(null);
  }

  // OS files carry no internal payload — dataTransfer.files is set instead.
  function droppedFiles(e) {
    return e.dataTransfer?.files?.length ? [...e.dataTransfer.files] : null;
  }

  function handleFolderDrop(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const osFiles = droppedFiles(e);
    if (osFiles) {
      onUploadFiles(osFiles, folderId);
      return;
    }
    const p = readDrop(e);
    if (!p || (p.kind === "folder" && String(p.id) === String(folderId))) return;
    onMove(p.kind, p.id, folderId);
  }

  function handleRootDrop(e) {
    e.preventDefault();
    const osFiles = droppedFiles(e);
    if (osFiles) {
      onUploadFiles(osFiles, null);
      return;
    }
    const p = readDrop(e);
    if (!p) return;
    onMove(p.kind, p.id, null);
  }

  // Close the menu on any outside click or Escape.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const blankMenu = [
    { label: "New Note", icon: LuFilePlus, action: () => onNewNote(null) },
    { label: "New Folder", icon: LuFolderPlus, action: () => onNewFolder(null) },
  ];

  const folderMenu = (folder) => [
    { label: "New Note Here", icon: LuFilePlus, action: () => onNewNote(folder._id) },
    { label: "New Subfolder", icon: LuFolderPlus, action: () => onNewFolder(folder._id) },
    { label: "Rename", icon: LuPencil, action: () => onRenameStart("folder", folder._id) },
    { label: "Delete Folder", icon: LuTrash2, danger: true, action: () => onDeleteFolder(folder._id, folder.name) },
  ];

  const sortIcons = { created: LuClock, updated: LuHistory, az: LuArrowDownAZ, za: LuArrowUpZA };
  const sortMenu = Object.entries(SORTS).map(([key, s]) => ({
    label: s.label,
    icon: sortIcons[key],
    active: sortBy === key,
    action: () => setSortBy(key),
  }));

  const noteMenu = (note) => [
    { label: "Open", icon: LuExternalLink, action: () => onSelectNote(note._id) },
    { label: "Rename", icon: LuPencil, action: () => onRenameStart("note", note._id) },
    { label: "Delete Note", icon: LuTrash2, danger: true, action: () => onDeleteNote(note._id, note.title) },
  ];

  const fileMenu = (file) => [
    { label: "Open", icon: LuExternalLink, action: () => onSelectFile(file._id) },
    { label: "Download", icon: LuDownload, action: () => downloadFile(file) },
    { label: "Info", icon: LuInfo, action: () => setShowInfo(file) },
    { label: "Rename", icon: LuPencil, action: () => onRenameStart("file", file._id) },
    { label: "Delete File", icon: LuTrash2, danger: true, action: () => onDeleteFile(file._id, file.name) },
  ];

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => openMenu(e, blankMenu)}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <h1 className="text-sm font-semibold tracking-wide text-neutral-100">My Notes</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNewNote(null)}
              title="New note"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuPlus size={15} />
            </button>
            <button
              onClick={() => onNewFolder(null)}
              title="New folder"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuFolderPlus size={15} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Add file"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuUpload size={15} />
            </button>
            <button
              onClick={(e) => openMenu(e, sortMenu)}
              title={`Sort notes: ${SORTS[sortBy]?.label || "Created date"}`}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              <LuArrowDownWideNarrow size={15} />
            </button>
            <button
              onClick={() => {
                setTreeSignal((s) => ({ open: !allOpen, n: (s?.n || 0) + 1 }));
                setAllOpen((v) => !v);
              }}
              title={allOpen ? "Collapse all folders" : "Expand all folders"}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            >
              {allOpen ? <LuChevronsDownUp size={15} /> : <LuChevronsUpDown size={15} />}
            </button>

            <button
              onClick={onSortAll}
              disabled={sorting !== null || unfiledCount === 0}
              title={
                sorting
                  ? `Sorting ${sorting.done}/${sorting.total}...`
                  : `AI Sort All${unfiledCount > 0 ? ` (${unfiledCount} unfiled)` : ""}`
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-400 text-[#06202a] hover:bg-cyan-300 disabled:cursor-default disabled:opacity-40"
            >
              <LuSparkles size={15} className={sorting ? "animate-pulse" : ""} />
            </button>
          </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onUploadFiles([...e.target.files], null);
          e.target.value = "";
        }}
      />

      {menu && createPortal(
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="glass fixed z-50 w-44 overflow-hidden rounded-xl p-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                closeMenu();
                item.action();
              }}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left ${
                item.danger
                  ? "text-red-300 hover:bg-red-400/10"
                  : item.active
                    ? "bg-cyan-400/15 text-cyan-100"
                    : "text-neutral-200 hover:bg-cyan-400/10"
              }`}
            >
              {item.icon && (
                <item.icon
                  size={14}
                  className={`shrink-0 ${item.danger ? "text-red-300/70" : "text-neutral-500"}`}
                />
              )}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* File info (from the file row right-click menu) */}
      {showInfo &&
        createPortal(
          (() => {
            const fid = showInfo.folderId?._id || showInfo.folderId || null;
            const location = fid
              ? folders.find((x) => String(x._id) === String(fid))?.name || "Unknown folder"
              : "Unfiled";
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                onClick={() => setShowInfo(null)}
              >
                <div
                  className="glass w-full max-w-sm rounded-2xl p-5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h3 className="truncate text-sm font-semibold text-neutral-100">
                    {showInfo.name}
                  </h3>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {[
                      ["Type", showInfo.mimeType || "Unknown"],
                      ["Size", formatSize(showInfo.size)],
                      ["Location", location],
                      ["Created", formatDate(showInfo.createdAt)],
                      ["Modified", formatDate(showInfo.updatedAt)],
                    ].map(([k, v]) => (
                      <div key={k} className="flex gap-3">
                        <dt className="w-20 shrink-0 text-neutral-500">{k}</dt>
                        <dd
                          className="min-w-0 flex-1 truncate text-neutral-200"
                          title={String(v)}
                        >
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => setShowInfo(null)}
                      className="rounded-lg bg-cyan-400 px-4 py-1.5 text-sm font-medium text-[#06202a] hover:bg-cyan-300"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}

      <div
        className="flex-1 overflow-y-auto p-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleRootDrop}
      >
        {rootFolders.map((f) => (
              <FolderNode
                key={f._id}
                folder={f}
                folders={folders}
                notesByFolder={notesByFolder}
                filesByFolder={filesByFolder}
                depth={0}
                selectedNoteId={selectedNoteId}
                selectedFileId={selectedFileId}
                onSelectNote={onSelectNote}
                onSelectFile={onSelectFile}
                onFolderMenu={(e, folder) => openMenu(e, folderMenu(folder))}
                onNoteMenu={(e, note) => openMenu(e, noteMenu(note))}
                onFileMenu={(e, file) => openMenu(e, fileMenu(file))}
                renaming={renaming}
                onRenameStart={onRenameStart}
                onRenameNote={onRenameNote}
                onRenameFolder={onRenameFolder}
                onRenameFile={onRenameFile}
                onRenameCancel={onRenameCancel}
                reveal={reveal}
                treeSignal={treeSignal}
                sortFn={folderFn}
                dragOver={dragOver}
                onDragStart={startDrag}
                onFolderDragOver={handleFolderDragOver}
                onDragLeaveRow={handleDragLeave}
                onDragEndRow={clearDragOver}
                onFolderDrop={handleFolderDrop}
              />
            ))}
            {(unfiled.length > 0 || unfiledFiles.length > 0) && (
              <div className="mt-2">
                <p className="px-2 pb-1 text-xs text-neutral-500">Unfiled</p>
                {unfiled.map((n) => (
                  <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={(e, note) => openMenu(e, noteMenu(note))} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameNote} onRenameCancel={onRenameCancel} onDragStart={(e) => startDrag(e, { kind: "note", id: n._id })} revealN={reveal?.n} />
                ))}
                {unfiledFiles.map((f) => (
                  <FileRow key={f._id} file={f} selected={f._id === selectedFileId} onSelect={onSelectFile} onMenu={(e, file) => openMenu(e, fileMenu(file))} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameFile} onRenameCancel={onRenameCancel} onDragStart={(e) => startDrag(e, { kind: "file", id: f._id })} revealN={reveal?.n} />
                ))}
              </div>
            )}
            {folders.length === 0 && notes.length === 0 && (files || []).length === 0 && (
              <p className="px-2 pt-4 text-sm text-neutral-500">
                No notes yet. Right-click anywhere here for New Note / New Folder.
              </p>
            )}
      </div>
    </div>
  );
}

function FolderNode({
  folder,
  folders,
  notesByFolder,
  filesByFolder,
  depth,
  selectedNoteId,
  selectedFileId,
  onSelectNote,
  onSelectFile,
  onFolderMenu,
  onNoteMenu,
  onFileMenu,
  renaming,
  onRenameStart,
  onRenameNote,
  onRenameFolder,
  onRenameFile,
  onRenameCancel,
  reveal,
  treeSignal,
  sortFn,
  dragOver,
  onDragStart,
  onFolderDragOver,
  onDragLeaveRow,
  onDragEndRow,
  onFolderDrop,
}) {
  const [open, setOpen] = useState(true);

  // Expand/collapse-all buttons.
  useEffect(() => {
    if (treeSignal) setOpen(treeSignal.open);
  }, [treeSignal]);

  // Auto-reveal: open the path to the renaming item / selected note.
  useEffect(() => {
    if (reveal?.ids.includes(String(folder._id))) setOpen(true);
  }, [reveal, folder._id]);

  const kids = folders.filter((f) => String(f.parentId || "") === String(folder._id)).sort(sortFn);
  const notes = notesByFolder[folder._id] || [];
  const fileList = (filesByFolder || {})[folder._id] || [];
  const isRenaming = renaming?.kind === "folder" && renaming.id === folder._id;

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => onDragStart(e, { kind: "folder", id: folder._id })}
        onDragEnd={onDragEndRow}
        onDragOver={(e) => onFolderDragOver(e, folder._id)}
        onDragLeave={onDragLeaveRow}
        onDrop={(e) => onFolderDrop(e, folder._id)}
        onClick={() => setOpen(!open)}
        onDoubleClick={() => {
          setOpen(true);
          onRenameStart("folder", folder._id);
        }}
        onContextMenu={(e) => onFolderMenu(e, folder)}
        className={`flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 hover:bg-white/5 ${
          String(dragOver) === String(folder._id) ? "bg-cyan-400/10 ring-1 ring-inset ring-cyan-400/40" : ""
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
          className="flex w-4 items-center justify-center text-neutral-500"
        >
          {open ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        </button>
        <span className="flex items-center text-neutral-500">
          {open ? <LuFolderOpen size={15} /> : <LuFolder size={15} />}
        </span>
        {isRenaming ? (
          <span className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
            <RenameInput
              initial={folder.name}
              onSubmit={(v) => onRenameFolder(folder._id, v)}
              onCancel={onRenameCancel}
            />
          </span>
        ) : (
          <span className="flex-1 truncate text-sm font-medium text-neutral-200">{folder.name}</span>
        )}
        <span className="text-xs text-neutral-600">{notes.length + fileList.length}</span>
      </div>

      {open && (
        <div>
          {kids.map((k) => (
            <FolderNode
              key={k._id}
              folder={k}
              folders={folders}
              notesByFolder={notesByFolder}
              filesByFolder={filesByFolder}
              depth={depth + 1}
              selectedNoteId={selectedNoteId}
              selectedFileId={selectedFileId}
              onSelectNote={onSelectNote}
              onSelectFile={onSelectFile}
              onFolderMenu={onFolderMenu}
              onNoteMenu={onNoteMenu}
              onFileMenu={onFileMenu}
              renaming={renaming}
              onRenameStart={onRenameStart}
              onRenameNote={onRenameNote}
              onRenameFolder={onRenameFolder}
              onRenameFile={onRenameFile}
              onRenameCancel={onRenameCancel}
              reveal={reveal}
              treeSignal={treeSignal}
              sortFn={sortFn}
              dragOver={dragOver}
              onDragStart={onDragStart}
              onFolderDragOver={onFolderDragOver}
              onDragLeaveRow={onDragLeaveRow}
              onDragEndRow={onDragEndRow}
              onFolderDrop={onFolderDrop}
            />
          ))}
          <div style={{ paddingLeft: `${24 + depth * 12}px` }}>
            {notes.map((n) => (
              <NoteRow key={n._id} note={n} selected={n._id === selectedNoteId} onSelect={onSelectNote} onMenu={onNoteMenu} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameNote} onRenameCancel={onRenameCancel} onDragStart={(e) => onDragStart(e, { kind: "note", id: n._id })} revealN={reveal?.n} />
            ))}
            {fileList.map((f) => (
              <FileRow key={f._id} file={f} selected={f._id === selectedFileId} onSelect={onSelectFile} onMenu={onFileMenu} renaming={renaming} onRenameStart={onRenameStart} onRenameSubmit={onRenameFile} onRenameCancel={onRenameCancel} onDragStart={(e) => onDragStart(e, { kind: "file", id: f._id })} revealN={reveal?.n} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, selected, onSelect, onMenu, renaming, onRenameStart, onRenameSubmit, onRenameCancel, onDragStart, revealN }) {
  const isRenaming = renaming?.kind === "note" && renaming.id === note._id;
  const rowRef = useRef(null);

  // Auto-reveal: scroll the selected row into view when the target changes.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [revealN, selected]);

  if (isRenaming) {
    return (
      <div ref={rowRef} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm">
        <LuFileText size={14} className="shrink-0 text-neutral-500" />
        <RenameInput
          initial={note.title}
          onSubmit={(v) => onRenameSubmit(note._id, v)}
          onCancel={onRenameCancel}
        />
      </div>
    );
  }
  return (
    <button
      ref={rowRef}
      draggable
      onDragStart={onDragStart}
      onClick={() => onSelect(note._id)}
      onDoubleClick={() => onRenameStart("note", note._id)}
      onContextMenu={(e) => onMenu(e, note)}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${
        selected ? "bg-cyan-400/15 text-cyan-100" : "text-neutral-400 hover:bg-white/5"
      }`}
    >
      <LuFileText size={14} className="shrink-0 text-neutral-500" />
      <span className="truncate">{note.title}</span>
    </button>
  );
}

function FileRow({ file, selected, onSelect, onMenu, renaming, onRenameStart, onRenameSubmit, onRenameCancel, onDragStart, revealN }) {
  const isRenaming = renaming?.kind === "file" && renaming.id === file._id;
  const rowRef = useRef(null);

  // Auto-reveal: scroll the selected row into view when the target changes.
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [revealN, selected]);

  if (isRenaming) {
    return (
      <div ref={rowRef} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm">
        <FileTypeIcon mime={file.mimeType} />
        <RenameInput
          initial={file.name}
          onSubmit={(v) => onRenameSubmit(file._id, v)}
          onCancel={onRenameCancel}
        />
      </div>
    );
  }
  return (
    <button
      ref={rowRef}
      draggable
      onDragStart={onDragStart}
      onClick={() => onSelect(file._id)}
      onDoubleClick={() => onRenameStart("file", file._id)}
      onContextMenu={(e) => onMenu(e, file)}
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm ${
        selected ? "bg-cyan-400/15 text-cyan-100" : "text-neutral-400 hover:bg-white/5"
      }`}
    >
      <FileTypeIcon mime={file.mimeType} />
      <span className="truncate">{file.name}</span>
    </button>
  );
}

// Inline rename field: text selected on focus, Enter or clicking away commits, Escape cancels.
function RenameInput({ initial, onSubmit, onCancel }) {
  const [value, setValue] = useState(initial);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function cancel() {
    if (!alive.current) return;
    onCancel();
  }
  function commit() {
    if (!alive.current) return;
    const v = value.trim();
    if (!v || v === initial) onCancel();
    else onSubmit(v);
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className="w-full min-w-0 rounded-md border border-cyan-400/50 bg-white/[0.05] px-2 py-0.5 text-sm text-neutral-100 focus:outline-none"
    />
  );
}
