import { useEffect } from "react";
import { useAppStore } from "./state/store";
import { VaultPicker } from "./components/VaultPicker";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { TodoListView } from "./components/TodoListView";
import { TodoDetailView } from "./components/TodoDetailView";
import { QuickSwitcher } from "./components/QuickSwitcher";
import { PromptDialog } from "./components/PromptDialog";
import { DeskBuddy } from "./components/DeskBuddy";
import { FocusToggle } from "./components/FocusToggle";
import { InsightsPanel } from "./components/InsightsPanel";
import { InsightsToggle } from "./components/InsightsToggle";
import { BlockHistoryToggle } from "./components/BlockHistoryToggle";
import { NoteHistoryPanel } from "./components/NoteHistoryPanel";
import { NoteHistoryToggle } from "./components/NoteHistoryToggle";
import { AlwaysOnTopToggle } from "./components/AlwaysOnTopToggle";

function MainPane() {
  const todosViewOpen = useAppStore((s) => s.todosViewOpen);
  const currentTodoId = useAppStore((s) => s.currentTodoId);
  if (todosViewOpen) {
    return currentTodoId ? <TodoDetailView /> : <TodoListView />;
  }
  return <Editor />;
}

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
      <MainPane />
      <QuickSwitcher />
      <PromptDialog />
      <DeskBuddy />
      <InsightsPanel />
      <InsightsToggle />
      <BlockHistoryToggle />
      <NoteHistoryPanel />
      <NoteHistoryToggle />
      <AlwaysOnTopToggle />
      <FocusToggle />
    </div>
  );
}

export default App;
