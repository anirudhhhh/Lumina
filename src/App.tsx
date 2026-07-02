import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Workspace from "./pages/Workspace";
import Emulation from "./pages/Emulation";
import Reports from "./pages/Reports";
import { useAnalysisStore } from "./store/useAnalysisStore";
import { onRuntimeEvent } from "./lib/api";

export default function App() {
  const { refreshHealth, refreshReports, pushRuntimeEvent } = useAnalysisStore();

  useEffect(() => {
    refreshHealth();
    refreshReports();
    const interval = setInterval(refreshHealth, 15000);
    let unlisten: (() => void) | undefined;
    onRuntimeEvent(pushRuntimeEvent).then((u) => (unlisten = u));
    return () => {
      clearInterval(interval);
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/workspace" element={<Workspace />} />
        <Route path="/emulation" element={<Emulation />} />
        <Route path="/reports" element={<Reports />} />
      </Routes>
    </AppShell>
  );
}
