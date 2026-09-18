import { useAppStore } from "../state/store";

export function VaultPicker() {
  const chooseVault = useAppStore((s) => s.chooseVault);
  const error = useAppStore((s) => s.error);

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-xl font-semibold" style={{ color: "var(--text)" }}>
          Welcome to Notes
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-muted)" }}>
          Choose a folder on your computer to store your notes as plain markdown files.
        </p>
        <button
          onClick={() => void chooseVault()}
          className="rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          Choose folder
        </button>
        {error && (
          <p className="mt-4 text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
