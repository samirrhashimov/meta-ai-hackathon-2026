import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LuCheck, LuChevronDown, LuCopy, LuFilePlus, LuFolderPlus, LuMic, LuSearch, LuSend, LuSparkles, LuSquare, LuUndo2 } from "react-icons/lu";
import { encodeWav } from "../utils/audio";
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

export default function AiPanel({ onChanged, variant = "panel" }) {
  const home = variant === "home";
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [model, setModel] = useState(() => localStorage.getItem("ui.model") || DEFAULT_MODEL);
  const [modelOpen, setModelOpen] = useState(false);

  // Model list comes from the backend (backend/.env → META_MODELS).
  useEffect(() => {
    api
      .chatModels()
      .then((d) => {
        const list = Array.isArray(d.models) && d.models.length > 0 ? d.models : null;
        if (!list) return;
        setModels(list);
        setModel((cur) =>
          list.includes(cur) ? cur : list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : list[0]
        );
      })
      .catch(() => {});
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
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <h2 className="text-sm font-semibold text-neutral-100">Assistant</h2>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModelOpen((v) => !v);
            }}
            title="Select model"
            className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
              modelOpen
                ? "bg-cyan-400/20 text-cyan-100"
                : "text-neutral-400 hover:bg-white/5 hover:text-neutral-200"
            }`}
          >
            <span className="max-w-32 truncate">{model}</span>
            <LuChevronDown size={13} />
          </button>
          {modelOpen && (
            <div className="glass pop-in absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-xl p-1 text-sm">
              {models.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    selectModel(m);
                    setModelOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left ${
                    m === model
                      ? "bg-cyan-400/15 text-cyan-100"
                      : "text-neutral-300 hover:bg-white/5"
                  }`}
                >
                  {m === model ? (
                    <LuCheck size={14} className="shrink-0 text-cyan-300" />
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
        <Chat onChanged={onChanged} variant={variant} model={model} />
      </div>
    </div>
  );
}

// Cleared once per page load: every refresh starts with an empty chat.
let clearedOnce = false;

function Chat({ onChanged, variant, model }) {
  const home = variant === "home";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [copiedId, setCopiedId] = useState(null);
  const [reverting, setReverting] = useState(null); // assistant message awaiting undo confirm
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
    const now = Date.now();
    setMessages((prev) => [...prev, { _id: `tmp-${now}`, role: "user", content: text }]);
    setSending(true);
    try {
      const { reply, checkpoint, messageId } = await api.chat(text, model);
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
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-cyan-400/40 hover:bg-cyan-400/10"
                >
                  <s.icon size={16} className="text-cyan-300" />
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
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md border border-cyan-300/25 bg-cyan-400/15 px-3.5 py-2 text-sm leading-relaxed text-cyan-50">
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
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
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
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
              <LuSparkles size={12} />
            </span>
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  style={{ animationDelay: `${d}ms` }}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-300/70"
                />
              ))}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="mt-2">
        <form onSubmit={send} className="relative flex-1">
          <textarea
            ref={taRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) send(e);
            }}
            placeholder={listening ? "" : transcribing ? "Transcribing..." : "Ask Assistant..."}
            className={`md-chat-scroll block max-h-40 w-full resize-none overflow-hidden border border-white/10 bg-white/[0.03] pl-4 pr-[84px] leading-relaxed placeholder:text-neutral-600 focus:border-cyan-400/50 focus:outline-none ${
              home
                ? "rounded-[24px] py-3 text-[15px] shadow-lg shadow-black/30"
                : "rounded-[20px] py-2.5 text-sm"
            }`}
          />
          {listening && !input && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-6 items-center gap-1">
                {Array.from({ length: 21 }).map((_, i) => (
                  <span
                    key={i}
                    className="mic-bar w-[3px] rounded-full bg-cyan-300/80"
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
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-cyan-400 text-[#06202a] hover:bg-cyan-300 disabled:cursor-default disabled:opacity-40"
          >
            <LuSend size={14} />
          </button>
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
                  className="rounded-lg bg-cyan-400 px-3 py-1.5 text-sm font-medium text-[#06202a] hover:bg-cyan-300"
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


