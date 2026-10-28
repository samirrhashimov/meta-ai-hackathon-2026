import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { LuMic, LuSend, LuSparkles, LuSquare } from "react-icons/lu";
import { encodeWav } from "../utils/audio";

const HINTS = [
  "Create a Sports folder and move my gym note into it.",
  "Find all my notes about travel.",
  "Summarize my meeting notes from this week.",
  "File my unfiled notes into folders.",
  "What did I write about books?",
];

// Right panel: the Assistant chat.
export default function AiPanel({ onChanged }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-white/10 px-3">
        <h2 className="text-sm font-semibold text-neutral-100">Assistant</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <Chat onChanged={onChanged} />
      </div>
    </div>
  );
}

// Cleared once per page load: every refresh starts with an empty chat.
let clearedOnce = false;

function Chat({ onChanged }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState("");
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

  // Rotate example prompts while the chat is empty.
  useEffect(() => {
    if (messages.length > 0) return;
    const t = setInterval(() => {
      setHintVisible(false);
      setTimeout(() => {
        setHintIdx((i) => (i + 1) % HINTS.length);
        setHintVisible(true);
      }, 300);
    }, 4000);
    return () => clearInterval(t);
  }, [messages.length]);

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
      const { reply } = await api.chat(text);
      setMessages((prev) => [...prev, { _id: `tmp-${now}-a`, role: "assistant", content: reply }]);
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
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-cyan-300">
              <LuSparkles size={19} />
            </span>
            <p className="text-sm font-medium text-neutral-300">
              Ask me to find, create, move, or organize your notes
            </p>
            <button
              onClick={() => setInput(HINTS[hintIdx])}
              title="Click to try it"
              className={`mt-2 max-w-full text-sm text-neutral-500 transition-all duration-300 hover:text-cyan-200 ${
                hintVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
              }`}
            >
              “{HINTS[hintIdx]}”
            </button>
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m._id} className="mb-2.5 flex justify-end">
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-br-md border border-cyan-300/25 bg-cyan-400/15 px-3.5 py-2 text-sm leading-relaxed text-cyan-50">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ) : (
            <div key={m._id} className="mb-2.5 flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-300">
                <LuSparkles size={12} />
              </span>
              <div className="max-w-[85%] min-w-0 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-3.5 py-2 text-sm leading-relaxed text-neutral-300">
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
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
            className="md-chat-scroll block max-h-40 w-full resize-none overflow-hidden rounded-[20px] border border-white/10 bg-white/[0.03] py-2.5 pl-4 pr-[84px] text-sm leading-relaxed placeholder:text-neutral-600 focus:border-cyan-400/50 focus:outline-none"
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
            className={`absolute bottom-1.5 right-11 flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40 ${
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
            className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-[#06202a] hover:bg-cyan-300 disabled:cursor-default disabled:opacity-40"
          >
            <LuSend size={14} />
          </button>
        </form>
        {speechError && <p className="mt-1 px-2 text-xs text-red-300">{speechError}</p>}
      </div>
    </div>
  );
}


