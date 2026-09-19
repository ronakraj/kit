import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSavedAlwaysOnTop, saveAlwaysOnTop } from "../lib/vault";
import { PinIcon } from "./icons";

export function AlwaysOnTopToggle() {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await getSavedAlwaysOnTop();
      if (saved) {
        await getCurrentWindow().setAlwaysOnTop(true);
      }
      setPinned(saved);
    })();
  }, []);

  const toggle = async () => {
    const next = !pinned;
    await getCurrentWindow().setAlwaysOnTop(next);
    await saveAlwaysOnTop(next);
    setPinned(next);
  };

  return (
    <button
      onClick={() => void toggle()}
      title={pinned ? "Always on top (on) — click to turn off" : "Keep Kit on top of other windows"}
      className="fixed right-[8.75rem] top-3 z-30 flex h-7 w-7 items-center justify-center rounded"
      style={{ color: pinned ? "var(--accent)" : "var(--text-muted)" }}
    >
      <PinIcon />
    </button>
  );
}
