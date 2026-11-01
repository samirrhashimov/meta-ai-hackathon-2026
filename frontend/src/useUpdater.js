import { useCallback, useEffect, useRef, useState } from "react";
import { checkForUpdates, installUpdate } from "./updater";

let autoChecked = false;

// Owns the whole update flow: auto-check on startup, manual checks through
// the "flama:check-updates" event, dialog state and the install itself.
export function useUpdater() {
  const [update, setUpdate] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const running = useRef(false);

  const runCheck = useCallback(async ({ silent }) => {
    if (running.current) return null;
    running.current = true;
    setError("");
    if (!silent) setNote("");
    try {
      const found = await checkForUpdates();
      if (found) {
        setDismissed(false);
        setUpdate(found);
        setProgress(0);
        setOpen(true);
      } else if (!silent) {
        setNote("You're up to date.");
      }
      return found;
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (autoChecked) return;
    autoChecked = true;
    // One-shot startup check: the updater has no event to subscribe to,
    // so the initial check must run here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runCheck({ silent: true });
    const manual = () => runCheck({ silent: false });
    window.addEventListener("flama:check-updates", manual);
    return () => window.removeEventListener("flama:check-updates", manual);
  }, [runCheck]);

  const install = useCallback(async () => {
    if (!update || busy) return;
    setError("");
    setBusy(true);
    try {
      await installUpdate(update, (event) => {
        if (event.event === "Progress") {
          const { chunkLength } = event.data;
          setProgress((p) => Math.min(99, p + chunkLength / 50000));
        } else if (event.event === "Finished") {
          setProgress(100);
        }
      });
      // The installer restarts the app itself.
    } catch (e) {
      setError(e?.message || "Update failed");
      setBusy(false);
      setOpen(true);
    }
  }, [update, busy]);

  const close = useCallback(() => {
    if (busy) return;
    setDismissed(true);
    setOpen(false);
    setError("");
    setProgress(0);
  }, [busy]);

  return { update, open, busy, progress, error, note, dismissed, install, close };
}
