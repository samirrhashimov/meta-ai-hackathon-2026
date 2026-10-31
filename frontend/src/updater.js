import { check } from "@tauri-apps/plugin-updater";

// Silent-capable update check. Returns the Update object or null.
// Never throws: browsers, dev builds and offline all resolve to null.
export async function checkForUpdates() {
  try {
    return await check({ timeout: 15000 });
  } catch {
    return null;
  }
}

export async function installUpdate(update, onEvent) {
  await update.download((event) => onEvent?.(event));
  await update.install();
}
