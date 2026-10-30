import { useRef, useState } from "react";
import {
  LuCheck,
  LuChevronDown,
  LuDownload,
  LuEye,
  LuEyeOff,
  LuLoaderCircle,
  LuLogOut,
  LuTrash2,
} from "react-icons/lu";
import { api } from "../api";
import { currentAccent } from "../accent";
import { THEMES, presetHex, themeOf } from "../themes";
import { DEFAULT_SETTINGS } from "../settings";
import { SHORTCUTS } from "../shortcuts";
import Modal, { Kbd } from "./Modal";

function Section({ title, desc, children }) {
  return (
    <div className="border-b border-white/[0.07] px-5 py-4 last:border-0">
      <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
      {desc && <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{desc}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-relaxed text-neutral-600">{hint}</span>}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  const acc = currentAccent();
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-xs font-medium text-neutral-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-neutral-600">{hint}</span>}
      </span>
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? acc.solid.split(" ")[0] : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

// Destructive confirm: password + checkbox gate before the action runs.
// onConfirm(password) returns a promise; failures stay in the modal.
function DangerModal({ title, message, confirmLabel, inputCls, onClose, onConfirm }) {
  const [password, setPassword] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Password managers love filling anything shaped like a password field.
  // It stays read-only until focused, so autofill never drops a saved
  // login password in here.
  const [armed, setArmed] = useState(false);
  const ready = password !== "" && checked && !busy;

  async function confirm() {
    if (!ready) return;
    setError("");
    setBusy(true);
    try {
      await onConfirm(password);
    } catch (e) {
      setError(e.message || "Failed");
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="glass w-full max-w-sm rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-neutral-100">{title}</h3>
          <p className="mt-1 text-sm text-neutral-400">{message}</p>
          <label className="mt-4 block">
            <span className="mb-1 block text-xs font-medium text-neutral-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              name="flama-danger-password"
              autoComplete="new-password"
              spellCheck={false}
              data-lpignore="true"
              readOnly={!armed}
              onFocus={() => setArmed(true)}
              onBlur={() => setArmed(false)}
              className={inputCls}
            />
          </label>
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 accent-red-400"
            />
            I understand this cannot be undone
          </label>
          {error && <p className="mt-2 text-xs danger-text">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
            >
              Keep <Kbd>Esc</Kbd>
            </button>
            <button
              data-modal-primary
              onClick={confirm}
              disabled={!ready}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-400 px-3 py-1.5 text-sm font-medium text-[#2a0a0a] hover:bg-red-500 hover:text-white disabled:opacity-50"
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Settings: API connection, assistant defaults, automation, appearance,
// chat, data, about. Stored locally (ui.settings) for now.
export default function SettingsModal({ settings, onChange, onClose, notes, folders, files, onDataChanged, onLogout, userEmail }) {
  const acc = currentAccent();
  const inputCls = `w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600 ${acc.focusBorder} focus:outline-none`;
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [showKey, setShowKey] = useState(false);
  const [danger, setDanger] = useState(null); // "wipe" | "account" | null
  // Password managers love filling anything shaped like a password field
  // (this input defaults to type="password"). It stays read-only until
  // focused, so autofill never drops a phantom key in here.
  const [keyArmed, setKeyArmed] = useState(false);

  const [pickingColor, setPickingColor] = useState(false);
  const [customOpen, setCustomOpen] = useState(false); // custom card expanded
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isCustomHex = /^#[0-9a-fA-F]{6}$/.test(settings.accent || "");
  const current = themeOf(settings); // gallery match, or null for Custom

  const set = (patch) => onChange({ ...settings, ...patch });

  async function testKey() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testKey();
      setTestResult({ ok: true, message: `Connected (${r.model || "model OK"})` });
    } catch (e) {
      setTestResult({ ok: false, message: e.message || "Connection failed" });
    } finally {
      setTesting(false);
    }
  }

  function exportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      folders: (folders || []).map((f) => ({ name: f.name, parentId: f.parentId || null })),
      notes: (notes || []).map((n) => ({
        title: n.title,
        content: n.content || "",
        folder: n.folderId?.name || null,
        tags: n.tags || [],
      })),
      files: (files || []).map((f) => ({ name: f.name, folder: f.folderId?.name || null })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "flama-export.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function confirmWipe(password) {
    await api.resetData(password);
    setDanger(null);
    onDataChanged?.();
  }

  async function confirmDeleteAccount(password) {
    await api.deleteAccount(password);
    setDanger(null);
    onLogout?.();
  }

  return (
    <>
    <Modal onClose={onClose}>
      {(close) => (
        <div className="glass w-full max-w-lg overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-neutral-100">Settings</h3>
            <Kbd>Esc</Kbd>
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <Section title="API Connection">
              <Field label="Meta API Key">
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={settings.apiKey}
                    onChange={(e) => set({ apiKey: e.target.value })}
                    placeholder="e.g. muse-..."
                    className={`${inputCls} pr-9`}
                    name="flama-meta-api-key"
                    autoComplete="off"
                    spellCheck={false}
                    readOnly={!keyArmed}
                    onFocus={() => setKeyArmed(true)}
                    onBlur={() => setKeyArmed(false)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    title={showKey ? "Hide key" : "Show key"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-neutral-500 hover:text-neutral-200"
                  >
                    {showKey ? <LuEyeOff size={14} /> : <LuEye size={14} />}
                  </button>
                </div>
              </Field>
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-200"
              >
                <LuChevronDown
                  size={13}
                  className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
                Advanced settings
              </button>
              {showAdvanced && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base URL" hint="Empty = default.">
                    <input
                      value={settings.apiBase}
                      onChange={(e) => set({ apiBase: e.target.value })}
                      placeholder="https://api.meta.ai/v1"
                      className={inputCls}
                      name="flama-meta-base-url"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                  <Field label="Custom model" hint="Added to the picker.">
                    <input
                      value={settings.customModel}
                      onChange={(e) => set({ customModel: e.target.value })}
                      placeholder="e.g. muse-spark-1.3"
                      className={inputCls}
                      name="flama-custom-model"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={testKey}
                  disabled={testing}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {testing && <LuLoaderCircle size={13} className="animate-spin" />}
                  Test connection
                </button>
                {testResult && (
                  <span
                    className={`flex items-center gap-1 text-xs ${
                      testResult.ok ? "text-emerald-300" : "danger-text"
                    }`}
                  >
                    {testResult.ok && <LuCheck size={13} />}
                    {testResult.message}
                  </span>
                )}
              </div>
            </Section>

            <Section title="Automation" desc="What the AI may do on its own.">
              <Toggle
                label="Auto-sort new notes"
                hint="AI files every new note into a folder right after creation."
                checked={settings.autoSort}
                onChange={(v) => set({ autoSort: v })}
              />
              <Toggle
                label="Auto-generate tags"
                hint="AI adds tags to notes and files in the background."
                checked={settings.autoTag}
                onChange={(v) => set({ autoTag: v })}
              />
            </Section>

            <Section title="Appearance" desc="Editor and accent.">
              <Field label="Editor font size">
                <div className="flex gap-1.5">
                  {[
                    { v: "s", label: "Small" },
                    { v: "m", label: "Medium" },
                    { v: "l", label: "Large" },
                  ].map((o) => (
                    <button
                      key={o.v}
                      onClick={() => set({ editorFont: o.v })}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                        settings.editorFont === o.v
                          ? `border ${acc.softBorder} ${acc.softBg} ${acc.softText}`
                          : "border border-white/10 text-neutral-400 hover:bg-white/5"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Theme">
                <div className="grid grid-cols-3 gap-2">
                  {THEMES.map((t) => {
                    const hex = presetHex(t.accent);
                    const active = current?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        title={`${t.name} (${t.blurb})`}
                        onClick={() => {
                          setCustomOpen(false);
                          set({ theme: t.theme, accent: t.accent });
                        }}
                        className="rounded-xl border border-white/10 p-2 text-left hover:border-white/25"
                        style={
                          active
                            ? { borderColor: hex, boxShadow: `0 0 0 1px ${hex}` }
                            : undefined
                        }
                      >
                        <span
                          className="block overflow-hidden rounded-lg border border-white/10"
                          style={{ background: t.theme === "dark" ? "#17171c" : "#ececee" }}
                        >
                          <span className="flex items-center gap-1 px-2 pt-1.5">
                            {[0, 1, 2].map((d) => (
                              <span
                                key={d}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    t.theme === "dark"
                                      ? "rgba(255,255,255,0.25)"
                                      : "rgba(0,0,0,0.2)",
                                }}
                              />
                            ))}
                          </span>
                          <span className="flex gap-1.5 p-2">
                            <span
                              className="flex w-8 flex-col gap-1 rounded p-1"
                              style={{
                                background:
                                  t.theme === "dark"
                                    ? "rgba(255,255,255,0.06)"
                                    : "rgba(0,0,0,0.06)",
                              }}
                            >
                              <span
                                className="h-1 w-full rounded-full"
                                style={{ background: hex }}
                              />
                              {[0, 1].map((l) => (
                                <span
                                  key={l}
                                  className="h-1 w-full rounded-full"
                                  style={{
                                    background:
                                      t.theme === "dark"
                                        ? "rgba(255,255,255,0.18)"
                                        : "rgba(0,0,0,0.15)",
                                  }}
                                />
                              ))}
                            </span>
                            <span className="flex flex-1 flex-col justify-center gap-1">
                              {[82, 64, 74].map((w, l) => (
                                <span
                                  key={l}
                                  className="h-1 rounded-full"
                                  style={{
                                    width: `${w}%`,
                                    background:
                                      l === 1
                                        ? hex
                                        : t.theme === "dark"
                                          ? "rgba(255,255,255,0.18)"
                                          : "rgba(0,0,0,0.15)",
                                  }}
                                />
                              ))}
                            </span>
                          </span>
                        </span>
                        <span className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-neutral-200">
                            {t.name}
                          </span>
                          {active && <LuCheck size={13} style={{ color: hex }} />}
                        </span>
                        <span className="block text-[11px] text-neutral-500">
                          {t.blurb}
                        </span>
                      </button>
                    );
                  })}
                  {(() => {
                    const customHex = isCustomHex ? settings.accent : presetHex(settings.accent);
                    const active = !current;
                    return (
                      <button
                        key="custom"
                        title="Custom — mix any mode with any color"
                        onClick={() => setCustomOpen(true)}
                        className="rounded-xl border border-white/10 p-2 text-left hover:border-white/25"
                        style={
                          active
                            ? { borderColor: customHex, boxShadow: `0 0 0 1px ${customHex}` }
                            : undefined
                        }
                      >
                        <span
                          className="block h-[68px] overflow-hidden rounded-lg border border-white/10"
                          style={{
                            background:
                              "conic-gradient(#f87171,#fbbf24,#34d399,#38bdf8,#a78bfa,#f87171)",
                          }}
                        />
                        <span className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs font-medium text-neutral-200">
                            Custom
                          </span>
                          {active && <LuCheck size={13} style={{ color: customHex }} />}
                        </span>
                        <span className="block text-[11px] text-neutral-500">
                          Any mix
                        </span>
                      </button>
                    );
                  })()}
                </div>
              </Field>
              <div>
                <button
                  onClick={() => {
                    localStorage.removeItem("ui.sidebarW");
                    localStorage.removeItem("ui.rightW");
                    window.location.reload();
                  }}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08]"
                >
                  Reset panel widths
                </button>
              </div>
            </Section>

            <Section title="Chat" desc="Assistant behavior.">
              <Toggle
                label="Show attachments in messages"
                hint="Display attached notes/files above each sent message."
                checked={settings.showChatAttachments}
                onChange={(v) => set({ showChatAttachments: v })}
              />
              <div>
                <button
                  onClick={() => api.clearChat().catch(() => {})}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08]"
                >
                  Clear chat history
                </button>
              </div>
            </Section>

            <Section title="Data" desc="Export or erase everything.">
              <div className="flex gap-2">
                <button
                  onClick={exportAll}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08]"
                >
                  <LuDownload size={13} />
                  Export all (JSON)
                </button>
                <button
                  onClick={() => setDanger("wipe")}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-xs danger-text hover:bg-red-400/20"
                >
                  <LuTrash2 size={13} />
                  Delete everything
                </button>
              </div>
            </Section>

            <Section
              title="Keyboard"
              desc="Global shortcuts. They work while typing too, except inside dialogs."
            >
              {SHORTCUTS.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-neutral-300">{s.label}</span>
                  <Kbd>{s.display}</Kbd>
                </div>
              ))}
            </Section>

            <Section title="About">
              <p className="text-xs leading-relaxed text-neutral-500">
                Flama · hackathon build · single-user demo.
              </p>
            </Section>

            <Section
              title="Account"
              desc={userEmail ? `Signed in as ${userEmail}.` : undefined}
            >
              <div className="flex gap-2">
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08]"
                >
                  <LuLogOut size={13} />
                  Log out
                </button>
                <button
                  onClick={() => setDanger("account")}
                  className="flex items-center gap-1.5 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-1.5 text-xs danger-text hover:bg-red-400/20"
                >
                  <LuTrash2 size={13} />
                  Delete account
                </button>
              </div>
            </Section>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
            <button
              onClick={() => {
                onChange(DEFAULT_SETTINGS);
              }}
              title="Restore all settings to defaults"
              className="rounded-lg px-2 py-1.5 text-xs text-neutral-500 hover:bg-white/5 hover:text-neutral-200"
            >
              Reset all
            </button>
            <button
              onClick={onClose}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${acc.solid}`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
    {pickingColor && (
      <ColorPickerModal
        initial={isCustomHex ? settings.accent : "#22d3ee"}
        onSave={(hex) => {
          set({ accent: hex });
          setPickingColor(false);
        }}
        onClose={() => setPickingColor(false)}
      />
    )}
    {customOpen && (
      <CustomThemeEditor
        initialTheme={settings.theme || "dark"}
        initialAccent={settings.accent}
        onClose={() => setCustomOpen(false)}
        onSave={(patch) => {
          set(patch);
          setCustomOpen(false);
        }}
      />
    )}
    {danger === "wipe" && (
      <DangerModal
        title="Delete everything"
        message="Every note, folder, file and chat in this account will be permanently deleted. Your account stays."
        confirmLabel="Delete everything"
        inputCls={inputCls}
        onClose={() => setDanger(null)}
        onConfirm={confirmWipe}
      />
    )}
    {danger === "account" && (
      <DangerModal
        title="Delete account"
        message="Your account and all of its notes, folders, files and chats will be permanently deleted."
        confirmLabel="Delete account"
        inputCls={inputCls}
        onClose={() => setDanger(null)}
        onConfirm={confirmDeleteAccount}
      />
    )}
    </>
  );
}

// Custom theme as its own modal: pick any mode + any color, OK applies it.
// The gallery shows it selected (unless the mix matches a preset theme).
function CustomThemeEditor({ initialTheme, initialAccent, onClose, onSave }) {
  const acc = currentAccent();
  const [theme, setTheme] = useState(initialTheme);
  const [accent, setAccent] = useState(initialAccent);
  const [picking, setPicking] = useState(false);
  const hex = /^#[0-9a-fA-F]{6}$/.test(accent || "") ? accent : presetHex(accent);
  return (
    <>
    <Modal onClose={onClose}>
      {(close) => (
        <div className="glass w-full max-w-xs overflow-hidden rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-neutral-100">Custom theme</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Mix any mode with any color.
          </p>
          <div className="mt-3 flex gap-1.5">
            {[
              { v: "dark", label: "Dark" },
              { v: "light", label: "Light" },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setTheme(o.v)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                  theme === o.v
                    ? `border ${acc.softBorder} ${acc.softBg} ${acc.softText}`
                    : "border border-white/10 text-neutral-400 hover:bg-white/5"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            title="Pick a custom color"
            onClick={() => setPicking(true)}
            style={{ borderColor: `${hex}66`, background: `${hex}1f` }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <span className="h-4 w-4 rounded-full" style={{ background: hex }} />
            <span className="font-mono uppercase" style={{ color: hex }}>
              {hex}
            </span>
          </button>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
            >
              Cancel <Kbd>Esc</Kbd>
            </button>
            <button
              data-modal-primary
              onClick={() => onSave({ theme, accent })}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${acc.solid}`}
            >
              OK <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      )}
    </Modal>
      {picking && (
        <ColorPickerModal
          initial={hex}
          onSave={(h) => {
            setAccent(h);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function hsvToHex(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : d / max, v: max };
}

// Custom accent picker: saturation/value square + hue slider + hex field.
function ColorPickerModal({ initial, onSave, onClose }) {
  const start = hexToHsv(/^#[0-9a-fA-F]{6}$/.test(initial || "") ? initial : "#22d3ee");
  const [h, setH] = useState(start.h);
  const [s, setS] = useState(start.s);
  const [v, setV] = useState(start.v);
  const [hex, setHex] = useState(initial);
  const boxRef = useRef(null);

  function update(nh, ns, nv) {
    setH(nh);
    setS(ns);
    setV(nv);
    setHex(hsvToHex(nh, ns, nv));
  }

  function pickFromBox(e) {
    const r = boxRef.current.getBoundingClientRect();
    update(h, clamp01((e.clientX - r.left) / r.width), 1 - clamp01((e.clientY - r.top) / r.height));
  }

  function onHexInput(raw) {
    setHex(raw);
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      const c = hexToHsv(raw);
      setH(c.h);
      setS(c.s);
      setV(c.v);
    }
  }



  return (
    <Modal onClose={onClose}>
      {(close) => (
        <div className="glass w-full max-w-xs overflow-hidden rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-neutral-100">Custom accent</h3>
          <div
            ref={boxRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pickFromBox(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) pickFromBox(e);
            }}
            className="relative mt-3 h-44 cursor-crosshair touch-none rounded-xl"
            style={{
              background: `hsl(${h},100%,50%)`,
            }}
            title="Pick saturation and brightness"
          >
            <div
              className="absolute inset-0 rounded-xl"
              style={{ background: "linear-gradient(to right,#fff,transparent)" }}
            />
            <div
              className="absolute inset-0 rounded-xl"
              style={{ background: "linear-gradient(to top,#000,transparent)" }}
            />
            <div
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
              style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: hex }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={Math.round(h)}
            onChange={(e) => update(Number(e.target.value), s, v)}
            className="rgb-range mt-3 w-full"
            style={{
              background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
            }}
            title="Hue"
          />

          <div className="mt-3 flex items-center gap-2">
            <span
              className="h-8 w-8 shrink-0 rounded-lg border border-white/20"
              style={{ background: hex }}
            />
            <input
              value={hex}
              onChange={(e) => onHexInput(e.target.value)}
              spellCheck={false}
              placeholder="#22d3ee"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-[#06202a]"
              style={{ background: hex }}
            >
              Aa
            </span>
            <span
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: `${hex}55`, background: `${hex}1f`, color: hex }}
            >
              Chip
            </span>
            <span className="text-sm" style={{ color: hex }}>
              Text
            </span>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={close}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5"
            >
              Cancel <Kbd>Esc</Kbd>
            </button>
            <button
              data-modal-primary
              onClick={() => onSave(hex)}
              disabled={!/^#[0-9a-fA-F]{6}$/.test(hex)}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium text-[#06202a] disabled:opacity-40"
              style={{ background: /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#52525b" }}
            >
              Use color <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
