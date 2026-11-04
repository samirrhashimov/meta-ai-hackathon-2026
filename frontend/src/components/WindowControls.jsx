import { useEffect, useState } from "react";
import { LuArrowLeft, LuCopy, LuMinus, LuSquare, LuX } from "react-icons/lu";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
        className="win-btn flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-white/10"
      >
        <LuMinus size={15} />
      </button>
      <button
        title={maxed ? "Restore" : "Maximize"}
        onClick={() => act(() => win.toggleMaximize())}
        className="win-btn flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-white/10"
      >
        {maxed ? <LuCopy size={13} /> : <LuSquare size={13} />}
      </button>
      <button
        title="Close"
        onClick={() => act(() => win.close())}
        className="win-btn win-btn-close flex w-11 items-center justify-center text-neutral-300 transition-colors select-none hover:bg-red-500 hover:text-white"
      >
        <LuX size={16} />
      </button>
    </>
  );
}

// Window buttons for the landing nav row, after Get started.
// Null in a plain browser, so the divider never renders on web.
export function NavWindowControls() {
  const { win, maxed, setMaxed } = useTauriWindow();
  if (!win) return null;
  return (
    <>
      <span className="land-nav-div" aria-hidden="true" />
      <div className="land-nav-win">
        <Controls win={win} maxed={maxed} setMaxed={setMaxed} />
      </div>
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
// which live outside the app header. With backTo it also renders
// in a plain browser as a back strip with no window controls.
export function WindowBar({ backTo } = {}) {
  const { win, maxed, setMaxed } = useTauriWindow();
  if (!win && !backTo) return null;
  return (
    <div data-tauri-drag-region onMouseDown={startWindowDrag} className="land-winbar">
      {backTo ? (
        <a href={backTo} title="Back" aria-label="Back" className="land-winbar-back">
          <LuArrowLeft size={16} />
        </a>
      ) : null}
      {win ? <Controls win={win} maxed={maxed} setMaxed={setMaxed} /> : null}
    </div>
  );
}
