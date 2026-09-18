import { useEffect, useState } from "react";
import { useAppStore } from "../state/store";

export function PromptDialog() {
  const request = useAppStore((s) => s.promptRequest);
  const resolvePrompt = useAppStore((s) => s.resolvePrompt);
  const [value, setValue] = useState("");

  useEffect(() => {
    // Resets the draft whenever a new prompt request comes in; the dialog is
    // shown/hidden by the same `request` prop, so there's no key-based remount
    // point to hang this off of instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (request) setValue(request.defaultValue);
  }, [request]);

  if (!request) return null;

  const submit = () => resolvePrompt(value);
  const cancel = () => resolvePrompt(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={cancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border p-4 shadow-xl"
        style={{ background: "var(--bg-panel)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm" style={{ color: "var(--text)" }}>
          {request.message}
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            else if (e.key === "Escape") cancel();
          }}
          className="w-full rounded border bg-transparent px-2 py-1.5 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--text)" }}
        />
        <div className="mt-3 flex justify-end gap-3 text-sm">
          <button onClick={cancel} style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
          <button onClick={submit} style={{ color: "var(--accent)" }}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
