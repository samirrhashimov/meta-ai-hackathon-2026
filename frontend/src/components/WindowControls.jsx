import { useEffect, useState } from "react";
import { LuCopy, LuMinus, LuSquare, LuX } from "react-icons/lu";
import { startWindowDrag } from "../tauri";

// Detects the Tauri window handle. Stays null in a plain browser,
// so window controls only ever render inside the desktop app.
function useTauriWindow() {
  const [win, setWin] = useState(null);
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    let alive = true;
    let unlisten;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const w = getCurrentWindow();
        try {
          setMaxed(await w.isMaximized());
        } catch {
          // state stays "restored"
        }
        try {
          unlisten = await w.onResized(async () => {
            if (!alive) return;
            try {
              setMaxed(await w.isMaximized());
            } catch {
              // keep the last known state
            }
          });
        } catch {
          // resize events unavailable: toggle stays optimistic
        }
        if (alive) setWin(w);
      } catch {
        // not running inside Tauri: render nothing
      }
    })();
    return () => {
      alive = false;
      if (unlisten) unlisten();
    };
  }, []);

  return { win, maxed, setMaxed };
}

function Controls({ win, maxed, setMaxed }) {
  const act = async (fn) => {
    try {
      await fn();
      try {
        setMaxed(await win.isMaximized());
      } catch {
        // keep the last known state
      }
    } catch {
      // window action failed: stay as is
    }
  };

  return (
    <>
      <button
        title="Minimize"
        onClick={() => act(() => win.minimize())}
        className="flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-white/10"
      >
        <LuMinus size={15} />
      </button>
      <button
        title={maxed ? "Restore" : "Maximize"}
        onClick={() => act(() => win.toggleMaximize())}
        className="flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-white/10"
      >
        {maxed ? <LuCopy size={13} /> : <LuSquare size={13} />}
      </button>
      <button
        title="Close"
        onClick={() => act(() => win.close())}
        className="flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-red-500 hover:text-white"
      >
        <LuX size={16} />
      </button>
    </>
  );
}

// Native Windows window controls for the frameless Tauri window.
// Renders nothing when the app runs in a plain browser.
export default function WindowControls() {
  const { win, maxed, setMaxed } = useTauriWindow();
  if (!win) return null;
  return (
    <div className="flex shrink-0 items-stretch self-stretch">
      <Controls win={win} maxed={maxed} setMaxed={setMaxed} />
    </div>
  );
}

// Slim draggable system strip for the landing / auth pages,
// which live outside the app header. Null in a plain browser.
export function WindowBar() {
  const { win, maxed, setMaxed } = useTauriWindow();
  if (!win) return null;
  return (
    <div data-tauri-drag-region onMouseDown={startWindowDrag} className="land-winbar">
      <Controls win={win} maxed={maxed} setMaxed={setMaxed} />
    </div>
  );
}
