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
import { onRuntimeEvent } from "./lib/api";

export default function App() {
  const { refreshHealth, refreshReports, pushRuntimeEvent } = useAnalysisStore();
  const { settings, loaded, load } = useSettingsStore();

  useEffect(() => {
    refreshHealth();
    refreshReports();
    load();
    const interval = setInterval(refreshHealth, 15000);
    let unlisten: (() => void) | undefined;
    onRuntimeEvent(pushRuntimeEvent).then((u) => (unlisten = u));
    return () => {
      clearInterval(interval);
      unlisten?.();
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
