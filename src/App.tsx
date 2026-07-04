import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell";
import Onboarding from "./components/Onboarding";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import Emulation from "./pages/Emulation";
import Reports from "./pages/Reports";
import Chat from "./pages/Chat";
import Settings from "./pages/Settings";
import { useAnalysisStore } from "./store/useAnalysisStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { onRuntimeEvent, onPipelineProgress } from "./lib/api";

export default function App() {
  const { refreshHealth, refreshReports, pushRuntimeEvent, setProgressLabel } =
    useAnalysisStore();
  const { settings, loaded, load } = useSettingsStore();

  useEffect(() => {
    refreshHealth();
    refreshReports();
    load();
    const interval = setInterval(refreshHealth, 15000);
    const unlisteners: Array<() => void> = [];
    onRuntimeEvent(pushRuntimeEvent).then((u) => unlisteners.push(u));
    // Live backend phase messages refine the progress bar label.
    onPipelineProgress((p) => setProgressLabel(p.message)).then((u) =>
      unlisteners.push(u)
    );
    return () => {
      clearInterval(interval);
      unlisteners.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // First-run gate: block the app until onboarding is completed (or skipped).
  if (loaded && settings && !settings.onboarded) {
    return <Onboarding />;
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/emulation" element={<Emulation />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
