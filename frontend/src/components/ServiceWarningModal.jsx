import { useState } from "react";
import Modal, { Kbd } from "./Modal";

const showServiceWarning = String(import.meta.env.VITE_SHOWWARNING || "").toLowerCase() === "true";

export default function ServiceWarningModal() {
  const [open, setOpen] = useState(showServiceWarning);

  if (!open) return null;

  return (
    <Modal onClose={() => setOpen(false)}>
      {(close) => (
        <div className="glass-modal w-full max-w-md rounded-2xl p-5">
          <img
            src="/undraw_notify_drs8.svg"
            alt="Notification"
            className="mx-auto mb-4 h-28 w-auto"
          />
          <h3 className="text-sm font-semibold text-neutral-100">Some features may not work</h3>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            The backend service is currently unavailable, so some parts of the application may
            not work properly.
          </p>
          <p className="mt-2 text-sm leading-6 text-neutral-400">
            If you are self-hosting Flama, you can safely ignore this message. To disable this
            warning, set <code className="text-neutral-300">VITE_SHOWWARNING=true</code> in your{" "}
            <code className="text-neutral-300">.env</code> file.
          </p>
          <div className="mt-5 flex justify-end">
            <button
              data-modal-primary
              onClick={close}
              className="rounded-lg bg-cyan-400 px-3 py-1.5 text-sm font-medium text-cyan-950 hover:bg-cyan-300"
            >
              Continue <Kbd>Enter</Kbd>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
