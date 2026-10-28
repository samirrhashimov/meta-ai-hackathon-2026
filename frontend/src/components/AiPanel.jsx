import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { LuCheck, LuChevronDown, LuCopy, LuFilePlus, LuFileText, LuFolder, LuFolderPlus, LuMic, LuPlus, LuSearch, LuSend, LuSparkles, LuSquare, LuUndo2, LuX } from "react-icons/lu";
import { encodeWav } from "../utils/audio";
import { detectMention, insertTag } from "../utils/mentions";
import { FileTypeIcon } from "./FileViewer";
import { currentAccent } from "../accent";
import Modal from "./Modal";

// Landing suggestion cards: short label shown, full prompt goes to the box.
const SUGGESTIONS = [
  {
    icon: LuFolderPlus,
    label: "Sort into folders",
    desc: "File everything unfiled",
    prompt: "File my unfiled notes into folders.",
  },
  {
    icon: LuSearch,
    label: "Find a note",
    desc: "Search across all notes",
    prompt: "Find all my notes about travel.",
  },
  {
    icon: LuSparkles,
    label: "Summarize notes",
    desc: "Get the gist fast",
    prompt: "Summarize my meeting notes from this week.",
  },
  {
    icon: LuFilePlus,
    label: "Draft & file",
    desc: "Create and organize in one go",
    prompt: "Create a Sports folder and move my gym note into it.",
  },
];

// The Assistant: flagship surface, shown wide in the center ("home")
// when no tab is open and narrow in the right pane ("panel").
const FALLBACK_MODELS = [
  "muse-spark-1.3",
  "muse-spark-1.3-contributor",
  "muse-spark-1.2",
  "muse-spark-1.2-contributor",
  "muse-spark-1.1",
  "muse-wonder-1.0",
];
const DEFAULT_MODEL = "muse-spark-1.3-contributor";

export default function AiPanel({ onChanged, variant = "panel", notes = [], folders = [], files = [], defaultModel = "", showAttachments = true }) {
  const home = variant === "home";
  const panelRef = useRef(null);
  const acc = currentAccent();
  const [narrow, setNarrow] = useState(false);

  // Hide the header title when the panel gets too narrow for it.
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setNarrow(entries[0].contentRect.width < 220);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [models, setModels] = useState(FALLBACK_MODELS);
  // Manual picks persist (ui.model); otherwise the Settings default wins.
  const [model, setModel] = useState(
    () => localStorage.getItem("ui.model") || defaultModel || DEFAULT_MODEL
  );
  const [modelOpen, setModelOpen] = useState(false);

  // Model list comes from the backend (backend/.env → META_MODELS).
  // A Settings custom model is offered too, even when the backend is older.
  useEffect(() => {
    api
      .chatModels()
      .then((d) => {
        const list = Array.isArray(d.models) && d.models.length > 0 ? d.models : null;
        const merged = [
          ...new Set([...(list || FALLBACK_MODELS), ...(defaultModel ? [defaultModel] : [])]),
        ];
        setModels(merged);
        setModel((cur) => (merged.includes(cur) ? cur : defaultModel || DEFAULT_MODEL));
      })
      .catch(() => {
        if (defaultModel) setModels((prev) => [...new Set([...prev, defaultModel])]);
      });
  }, []);

  function selectModel(m) {
    setModel(m);
    localStorage.setItem("ui.model", m);
  }

  // Close the picker on any outside click or Escape.
  useEffect(() => {
    if (!modelOpen) return;
    const close = () => setModelOpen(false);
    const onKey = (e) => {
      if (e.key === "Escape") setModelOpen(false);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  return (
    <div ref={panelRef} className="flex h-full flex-col">
      <div className={`flex h-12 shrink-0 items-center border-b border-white/10 px-3 ${narrow && !home ? "justify-end" : "justify-between"}`}>
        {!(narrow && !home) && (
          <h2 className="truncate text-sm font-semibold text-neutral-100">Assistant</h2>
        )}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModelOpen((v) => !v);
            }}
            title="Select model"
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
              modelOpen
                ? `${acc.softBgStrong} ${acc.softText}`
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            <span className="max-w-32 truncate">{model}</span>
            <LuChevronDown size={13} />
          </button>
          {modelOpen && (
            <div className="pop-in absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0a1016]/95 p-1 text-sm shadow-xl shadow-black/50 backdrop-blur-xl">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    selectModel(m);
                    setModelOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left ${
                    m === model
                      ? `${acc.softBgStrong} ${acc.softText}`
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  {m === model ? (
                    <LuCheck size={14} className={`shrink-0 ${acc.text}`} />
                  ) : (
                    <span className="w-[14px] shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{m}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 flex-col ${home ? "p-4 sm:p-6" : "p-3"}`}>
        <Chat
          onChanged={onChanged}
          variant={variant}
          model={model}
          notes={notes}
          folders={folders}
          files={files}
          showAttachments={showAttachments}
        />
      </div>
    </div>
  );
}

// Cleared once per page load: every refresh starts with an empty chat.
let clearedOnce = false;

// Attachment pill: bordered standalone above the input; borderless ("bare")
// inside a sent bubble so it reads as one block with the message.
function AttachChip({ a, files, onRemove, bare }) {
  const acc = currentAccent();
  const mime = a.kind === "file" ? files.find((f) => f._id === a.id)?.mimeType : a.mime;
  return (
    <span
      className={
        bare
          ? `flex items-center gap-1.5 rounded-lg bg-black/25 px-2.5 py-1 text-[13px] leading-5 ${acc.softText}`
          : `flex items-center gap-2 rounded-xl border ${acc.softBorder} ${acc.softBg} py-1 pl-3 pr-1.5 text-[13px] leading-6 ${acc.softText}`
      }
    >
      {a.kind === "file" || a.kind === "upload" ? (
        <FileTypeIcon mime={mime} size={14} />
      ) : a.kind === "folder" ? (
        <LuFolder size={14} className="shrink-0 text-neutral-400" />
      ) : (
        <LuFileText size={14} className="shrink-0 text-neutral-400" />
      )}
      <span className="max-w-56 truncate">@{a.label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove attachment"
          className={`rounded-full p-1 ${acc.textDim} hover:bg-white/10 ${acc.softText}`}
        >
          <LuX size={14} />
        </button>
      )}
    </span>
  );
}

function Chat({ onChanged, variant, model, notes, folders, files, showAttachments = true }) {
  const home = variant === "home";
  const acc = currentAccent();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [reverting, setReverting] = useState(null); // assistant message awaiting undo confirm
  const [chips, setChips] = useState([]); // temp +/drop uploads only: [{ kind: "upload", id, label, mime }]
  const [mention, setMention] = useState(null); // @-query after the caret, or null
  const [uploading, setUploading] = useState(false);
  const caretRef = useRef(null);
  const mentionMap = useRef({}); // label -> { kind, id } for accent @-mentions
  const echoRef = useRef(null); // backdrop highlight layer synced under the textarea
  const filePickerRef = useRef(null);
  const bottomRef = useRef(null);
  const taRef = useRef(null);
  const audioRef = useRef(null); // { stream, ctx, processor, chunks } while recording

  // Auto-grow the input as the message gets longer. The scrollbar stays
  // hidden until the box hits its max height (also kills the phantom
  // 1px scrollbar from subpixel rounding on an empty box).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.overflowY = "hidden";
    if (el.scrollHeight > 160) {
      el.style.height = "160px";
      el.style.overflowY = "auto";
    } else {
      el.style.height = el.scrollHeight + "px";
    }
  }, [input]);

  // Wipe history on page load only; remounts (e.g. switching notes) keep it.
  useEffect(() => {
    if (!clearedOnce) {
      clearedOnce = true;
      api.clearChat().catch(() => {});
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  // Release the mic if the panel unmounts mid-recording.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      audioRef.current = null;
      if (a) {
        try {
          a.processor.disconnect();
        } catch {
          // already stopped
        }
        a.stream.getTracks().forEach((t) => t.stop());
        a.ctx.close().catch(() => {});
      }
    };
  }, []);

  function showSpeechError(text) {
    setSpeechError(text);
    window.setTimeout(() => setSpeechError(""), 4000);
  }

  // @-mention helpers: autocomplete, chips, drag-drop, + uploads.
  function labelFor(kind, id) {
    if (kind === "note") return notes.find((n) => n._id === id)?.title || null;
    if (kind === "folder") return folders.find((f) => f._id === id)?.name || null;
    if (kind === "file") return files.find((f) => f._id === id)?.name || null;
    return null;
  }

  function trackCaret(e) {
    caretRef.current = e.target.selectionStart;
    setMention(detectMention(e.target.value, e.target.selectionStart));
  }

  const candidates = useMemo(() => {
    if (mention === null) return [];
    const q = mention.toLowerCase();
    const out = [];
    for (const f of folders || [])
      if ((f.name || "").toLowerCase().includes(q))
        out.push({ kind: "folder", id: f._id, label: f.name });
    for (const n of notes || [])
      if ((n.title || "").toLowerCase().includes(q))
        out.push({ kind: "note", id: n._id, label: n.title });
    for (const f of files || [])
      if ((f.name || "").toLowerCase().includes(q))
        out.push({ kind: "file", id: f._id, label: f.name });
    return out.slice(0, 8);
  }, [mention, folders, notes, files]);

  // Inserts "@label " at the given index (or caret/end). The mention lives
  // only in the text (accent-colored); no chip is pinned for it.
  function insertMentionAt(kind, id, label, atIndex) {
    mentionMap.current[label] = { kind, id };
    setInput((prev) => {
      const { text } = insertTag(prev, atIndex ?? caretRef.current ?? prev.length, label);
      return text;
    });
  }

  // @label tokens actually present in the text resolve to attachments on send,
  // so the AI knows exactly which note/folder/file each accent mention means.
  function resolveMentionAttachments(text) {
    const out = [];
    const seen = new Set();
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [label, ref] of Object.entries(mentionMap.current)) {
      if (!ref || !ref.id) continue;
      const re = new RegExp(`@${esc(label)}(?=$|\\s|[.,!?;:])`);
      if (re.test(text)) {
        const key = `${ref.kind}:${ref.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ kind: ref.kind, id: ref.id, label });
        }
      }
    }
    return out;
  }

  // Splits the text so known @labels render in the accent color.
  function renderEcho(text) {
    const labels = Object.keys(mentionMap.current).sort((a, b) => b.length - a.length);
    const tail = <span key="zw">{"\u200b"}</span>;
    if (!labels.length || !text) return [text, tail];
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@(${labels.map(esc).join("|")})(?=$|\\s|[.,!?;:])`, "g");
    const parts = [];
    let last = 0;
    let m;
    let k = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
      parts.push(
        <span key={k++} className={currentAccent().text}>
          {m[0]}
        </span>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(<span key={k++}>{text.slice(last)}</span>);
    parts.push(tail);
    return parts;
  }

  function selectMention(c) {
    const pos = caretRef.current ?? input.length;
    const upto = input.slice(0, pos);
    const m = upto.match(/@([\p{L}\p{N}._-]*)$/u);
    const start = m ? pos - m[0].length : pos;
    const before = input.slice(0, start);
    const after = input.slice(pos).replace(/^ /, "");
    const next = `${before}@${c.label} ${after}`;
    setInput(next);
    mentionMap.current[c.label] = { kind: c.kind, id: c.id };
    setMention(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        const p = `${before}@${c.label} `.length;
        ta.focus();
        ta.setSelectionRange(p, p);
        caretRef.current = p;
      }
    });
  }

  // Caret index under a tree/OS drop; falls back to the tracked caret.
  function dropCaret(e) {
    const ta = taRef.current;
    try {
      if (ta && document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (r && ta.contains(r.startContainer)) {
          const pre = r.cloneRange();
          pre.selectNodeContents(ta);
          pre.setEnd(r.startContainer, r.startOffset);
          return pre.toString().length;
        }
      }
    } catch {
      // fall through to the tracked caret
    }
    return caretRef.current ?? input.length;
  }

  function handleInputDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const at = dropCaret(e);
    const osFiles = e.dataTransfer?.files?.length ? [...e.dataTransfer.files] : null;
    if (osFiles) {
      attachOsFiles(osFiles, at);
      return;
    }
    let p = null;
    try {
      p = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    if (!p || !p.id || !p.kind) return;
    const label = labelFor(p.kind, p.id);
    if (label) insertMentionAt(p.kind, p.id, label, at);
  }

  // OS files dropped (or picked with +) become temp chat attachments only:
  // nothing lands in the folder tree until the AI is told to place them.
  async function attachOsFiles(fileList, atIndex) {
    if (!fileList.length || uploading) return;
    setUploading(true);
    try {
      const fresh = [];
      for (const f of fileList) {
        const a = await api.attachUpload(f);
        if (a) fresh.push({ kind: "upload", id: a.id, label: a.name, mime: a.mimeType });
      }
      if (fresh.length > 0) {
        setChips((prev) => {
          const next = [...prev];
          for (const c of fresh)
            if (!next.some((x) => x.kind === c.kind && x.id === c.id)) next.push(c);
          return next;
        });
        // No @-mention text needed: chips ride along as attachments and the AI reads them itself.
      }
    } catch (err) {
      showSpeechError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // Copy a message to the clipboard, with a brief "Copied" confirmation.
  async function copyText(id, text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }

  // Undo everything this answer changed: notes/folders go back to the checkpoint.
  async function revertMessage(m) {
    if (!m.messageId) return;
    setReverting(m);
  }

  async function confirmRevert() {
    const m = reverting;
    if (!m) return;
    setReverting(null);
    try {
      const data = await api.revert(m.messageId);
      const n = data.restored ?? 0;
      const now = Date.now();
      setMessages((prev) => [
        ...prev.map((x) => (x._id === m._id ? { ...x, checkpoint: false } : x)),
        {
          _id: `tmp-${now}-info`,
          role: "info",
          content: `Undone — notes and folders restored (${n} change${n === 1 ? "" : "s"} reverted).`,
        },
      ]);
      onChanged();
    } catch (e) {
      showSpeechError(e.message || "Revert failed.");
    }
  }

  // Mic: records 16 kHz mono WAV until tapped again, then Muse Voice
  // Transcribe turns it into text in the box.
  async function toggleListen() {
    if (transcribing) return;
    if (listening) {
      stopRecording();
      return;
    }
    setSpeechError("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      showSpeechError("Microphone blocked — allow access in the browser bar.");
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC({ sampleRate: 16000 });
      const src = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      processor.onaudioprocess = (e) => {
        chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(processor);
      processor.connect(mute);
      mute.connect(ctx.destination);
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      audioRef.current = { stream, ctx, processor, chunks };
      setListening(true);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      showSpeechError("Could not start recording in this browser.");
    }
  }

  async function stopRecording() {
    const a = audioRef.current;
    audioRef.current = null;
    setListening(false);
    if (!a) return;
    const { stream, ctx, processor, chunks } = a;
    const rate = ctx.sampleRate || 16000;
    try {
      processor.disconnect();
    } catch {
      // already stopped
    }
    stream.getTracks().forEach((t) => t.stop());
    const total = chunks.reduce((n, c) => n + c.length, 0);
    await ctx.close().catch(() => {});
    if (total < rate * 0.3) {
      showSpeechError("Too short — hold the mic and speak.");
      return;
    }
    const flat = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) {
      flat.set(c, offset);
      offset += c.length;
    }
    setTranscribing(true);
    try {
      const { transcript } = await api.transcribe(encodeWav(flat, rate));
      if (transcript) {
        setInput((prev) => {
          const sep = prev && !prev.endsWith(" ") && !prev.endsWith("\n") ? " " : "";
          return (prev + sep + transcript).slice(0, 4000);
        });
      }
    } catch (e) {
      showSpeechError(e.message || "Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const attached = [...chips, ...resolveMentionAttachments(text)];
    const attachments = attached.map(({ kind, id }) => ({ kind, id }));
    setChips([]);
    mentionMap.current = {};
    setMention(null);
    const now = Date.now();
    setMessages((prev) => [
      ...prev,
      { _id: `tmp-${now}`, role: "user", content: text, attachments: attached },
    ]);
    setSending(true);
    try {
      const { reply, checkpoint, messageId } = await api.chat(text, model, attachments);
      setMessages((prev) => [
        ...prev,
        {
          _id: `tmp-${now}-a`,
          role: "assistant",
          content: reply,
          checkpoint: !!checkpoint,
          messageId,
        },
      ]);
      onChanged(); // the chat may have created/moved notes
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { _id: `tmp-${now}-e`, role: "assistant", content: "Error: " + err.message },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && !sending && (
          <div className="pop-in flex h-full flex-col items-center justify-center px-4 py-6 text-center">
            <p className={`font-semibold text-neutral-50 ${home ? "text-2xl" : "text-base"}`}>
              {home ? "How can I help you?" : "Assistant"}
            </p>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-neutral-400">
              Your second brain. Ask me to find, create, move, or organize your notes.
            </p>
            <div
              className={`mt-6 grid grid-cols-2 gap-2 ${home ? "w-full max-w-md" : "w-full max-w-xs"}`}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.prompt);
                    taRef.current?.focus();
                  }}
                  title="Click to try it"
                  className={`flex flex-col items-start gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left ${acc.borderHover} ${acc.softHover}`}
                >
                  <s.icon size={16} className={acc.text} />
                  <span className="text-xs font-medium text-neutral-100">{s.label}</span>
                  <span className="text-[11px] leading-snug text-neutral-500">{s.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.role === "info" ? (
            <div key={m._id} className="pop-in mb-3 flex justify-center">
              <p className="max-w-[90%] rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-center text-[11px] leading-relaxed text-neutral-500">
                {m.content}
              </p>
            </div>
          ) : m.role === "user" ? (
            <div key={m._id} className="pop-in group mb-3 flex flex-col items-end">
              <div className={`max-w-[85%] min-w-0 rounded-2xl rounded-br-md border ${acc.bubbleBorder} ${acc.bubbleBg} px-3.5 py-2 text-sm leading-relaxed text-neutral-50`}>
                {showAttachments && m.attachments?.length > 0 && (
                  <div className={`mb-2 flex flex-wrap gap-1.5 border-b ${acc.bubbleDivider} pb-2`}>
                    {m.attachments.map((a) => (
                      <AttachChip key={`${a.kind}:${a.id}`} a={a} files={files} bare />
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
              <button
                type="button"
                onClick={() => copyText(m._id, m.content)}
                title="Copy message"
                className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-500 opacity-0 transition-opacity hover:text-neutral-200 group-hover:opacity-100"
              >
                {copiedId === m._id ? <LuCheck size={12} /> : <LuCopy size={12} />}
                {copiedId === m._id ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <div key={m._id} className="pop-in group mb-3 flex items-start gap-2.5">
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${acc.bubbleBorder} ${acc.softBg} ${acc.text}`}>
                <LuSparkles size={13} />
              </span>
              <div className="min-w-0">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                  Assistant
                </p>
                <div className="max-w-full rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2 text-sm leading-relaxed text-neutral-300">
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
                <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => copyText(m._id, m.content)}
                    title="Copy message"
                    className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-500 hover:text-neutral-200"
                  >
                    {copiedId === m._id ? <LuCheck size={12} /> : <LuCopy size={12} />}
                    {copiedId === m._id ? "Copied" : "Copy"}
                  </button>
                  {m.checkpoint && (
                    <button
                      type="button"
                      onClick={() => revertMessage(m)}
                      title="Undo this answer's changes"
                      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-neutral-500 hover:text-amber-200"
                    >
                      <LuUndo2 size={12} />
                      Undo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        )}
        {sending && (
          <div className="mb-2 flex items-center gap-1.5 px-1 py-1">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${acc.bubbleBorder} ${acc.softBg} ${acc.text}`}>
              <LuSparkles size={12} />
            </span>
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: `${d}ms` }}
                  className={`h-1.5 w-1.5 animate-bounce rounded-full ${acc.dot}`}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2">
        {chips.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
            {chips.map((c) => (
              <AttachChip
                key={`${c.kind}:${c.id}`}
                a={c}
                files={files}
                onRemove={() =>
                  setChips((prev) => prev.filter((x) => !(x.kind === c.kind && x.id === c.id)))
                }
              />
            ))}
          </div>
        )}
        <form onSubmit={send} className="relative flex-1">
          {mention !== null && candidates.length > 0 && (
            <div className="glass-menu pop-in absolute bottom-full left-0 z-30 mb-2 max-h-56 w-64 overflow-y-auto rounded-xl p-1">
              {candidates.map((c) => (
                <button
                  key={`${c.kind}:${c.id}`}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMention(c)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-200 ${acc.softHover}`}
                >
                  {c.kind === "file" ? (
                    <FileTypeIcon
                      mime={files.find((f) => f._id === c.id)?.mimeType}
                      size={14}
                    />
                  ) : c.kind === "folder" ? (
                    <LuFolder size={14} className="shrink-0 text-neutral-500" />
                  ) : (
                    <LuFileText size={14} className="shrink-0 text-neutral-500" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">
                    {c.kind}
                  </span>
                </button>
              ))}
            </div>
          )}
          <input
            ref={filePickerRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) attachOsFiles([...e.target.files], null);
              e.target.value = "";
            }}
          />
          <div className="relative">
            <div
              ref={echoRef}
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words border border-transparent pl-12 pr-[84px] leading-relaxed text-[#e4e4e7] ${
                home ? "rounded-[24px] py-3 text-[15px]" : "rounded-[20px] py-2.5 text-sm"
              }`}
            >
              {renderEcho(input)}
            </div>
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              trackCaret(e);
            }}
            onSelect={trackCaret}
            onScroll={(e) => {
              if (echoRef.current) echoRef.current.scrollTop = e.target.scrollTop;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && mention !== null) {
                e.preventDefault();
                setMention(null);
              } else if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleInputDrop}
            placeholder={
              listening
                ? ""
                : transcribing
                  ? "Transcribing..."
                  : uploading
                    ? "Uploading..."
                    : "Ask Assistant... (@ to mention)"
            }
            className={`md-chat-scroll relative block max-h-40 w-full resize-none overflow-hidden border border-white/10 bg-white/[0.03] pl-12 pr-[84px] leading-relaxed text-transparent ${acc.caret} ${acc.selection} placeholder:text-neutral-600 ${acc.focusBorder} focus:outline-none ${
              home
                ? "rounded-[24px] py-3 text-[15px] shadow-lg shadow-black/30"
                : "rounded-[20px] py-2.5 text-sm"
            }`}
          />
          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            title="Attach file"
            className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
          >
            <LuPlus size={16} />
          </button>
          {listening && !input && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-6 items-center gap-1">
                {Array.from({ length: 21 }).map((_, i) => (
                  <span
                    key={i}
                    className={`mic-bar w-[3px] rounded-full ${acc.dot}`}
                    style={{ animationDelay: `${(i % 7) * 110}ms` }}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleListen}
            disabled={transcribing}
            title={listening ? "Stop recording" : "Voice input (Muse)"}
            className={`absolute right-11 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full disabled:opacity-40 ${
              listening
                ? "bg-red-400/20 text-red-300 hover:bg-red-400/30"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"
            }`}
          >
            {listening ? (
              <LuSquare size={13} className="animate-pulse" />
            ) : (
              <LuMic size={15} className={transcribing ? "animate-pulse" : ""} />
            )}
          </button>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            title="Send"
            className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full ${acc.solid} disabled:cursor-default disabled:opacity-40`}
          >
            <LuSend size={14} />
          </button>
          </div>
        </form>
        {speechError && <p className="mt-1 px-2 text-xs text-red-300">{speechError}</p>}
      </div>

      {reverting && (
        <Modal onClose={() => setReverting(null)}>
          {(close) => (
            <div className="glass w-full max-w-sm rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-neutral-100">Undo this answer</h3>
              <p className="mt-1 text-sm text-neutral-400">
                Notes and folders will go back to how they were before this answer:
              </p>
              <p className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-white/[0.04] p-2 text-xs leading-relaxed text-neutral-400">
                {reverting.content}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={close}
                  className="rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRevert}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${acc.solid}`}
                >
                  Restore
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}


