import { LuCheck, LuDownload, LuLoaderCircle, LuRefreshCw } from "react-icons/lu";
import { version as appVersion } from "../../package.json";
import Modal from "./Modal";

export function UpdateDialogHost({ state }) {
  const { update, open, busy, progress, error, install, close } = state;
  if (!open || !update) return null;
  return (
    <Modal onClose={close}>
      {(modalClose) => (
        <div className="glass-modal w-full max-w-sm rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-neutral-100">
            New version {update.version} is available
          </h3>
          {update.body && (
            <p className="mt-1 max-h-40 overflow-y-auto text-sm whitespace-pre-wrap text-neutral-400">
              {update.body}
            </p>
          )}
          {busy && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-cyan-400 transition-all"
                  style={{ width: `${Math.round(progress)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Downloading… {Math.round(progress)}%
              </p>
            </div>
          )}
          {error && <p className="mt-2 text-xs danger-text">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => {
                close();
                modalClose();
              }}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-neutral-300 hover:bg-white/5 disabled:opacity-50"
            >
              Later
            </button>
            <button
              data-modal-primary
              onClick={install}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 text-sm font-medium text-[#06202a] hover:bg-cyan-300 disabled:opacity-50"
            >
              {busy && <LuLoaderCircle size={14} className="animate-spin" />}
              Download and install
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}


// Navbar badge (Discord style): green while an update waits after the
// dialog was dismissed. Clicking installs straight away.
export function UpdateNavButton({ busy, onUpdate }) {
  return (
    <button
      title="Download and install update"
      onClick={onUpdate}
      disabled={busy}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-green-400 transition-colors select-none hover:bg-green-400/10 disabled:opacity-70"
    >
      {busy ? <LuLoaderCircle size={16} className="animate-spin" /> : <LuDownload size={16} />}
    </button>
  );
}

// Settings row: manual check button + transient status note.
export function UpdateSettingsRow({ note }) {
  return (
    <div>
      <button
        onClick={() => window.dispatchEvent(new Event("flama:check-updates"))}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 hover:bg-white/[0.08]"
      >
        <LuRefreshCw size={13} />
        Check for updates
      </button>
      <p className="mt-1.5 text-xs text-neutral-500">v{appVersion}</p>
      {note && (
        <p className="update-note-in mt-1 flex items-center gap-1 text-xs font-medium text-green-400">
          <LuCheck size={13} />
          {note}
        </p>
      )}
    </div>
  );
}
