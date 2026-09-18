import { useEffect } from "react";
import { useAppStore } from "./state/store";
import { VaultPicker } from "./components/VaultPicker";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { PromptDialog } from "./components/PromptDialog";
import { DeskBuddy } from "./components/DeskBuddy";
import { FocusToggle } from "./components/FocusToggle";
import { InsightsPanel } from "./components/InsightsPanel";
import { InsightsToggle } from "./components/InsightsToggle";

function App() {
  const vaultPath = useAppStore((s) => s.vaultPath);
  const vaultLoading = useAppStore((s) => s.vaultLoading);
  const initVault = useAppStore((s) => s.initVault);
  const sidebarHidden = useAppStore((s) => s.sidebarHidden);

  useEffect(() => {
    void initVault();
  }, [initVault]);

  if (vaultLoading) {
    return <div className="h-screen w-screen" style={{ background: "var(--bg)" }} />;
  }

  if (!vaultPath) {
    return <VaultPicker />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {!sidebarHidden && <Sidebar />}
      <Editor />
      <QuickSwitcher />
      <PromptDialog />
      <DeskBuddy />
      <InsightsPanel />
      <InsightsToggle />
      <FocusToggle />
    </div>
  );
}

export default App;
