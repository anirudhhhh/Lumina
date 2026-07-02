import { NavLink } from "react-router-dom";
import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon, StatusDot } from "./primitives";
import { useAnalysisStore } from "@/store/useAnalysisStore";

const NAV = [
  { to: "/", label: "DASHBOARD" },
  { to: "/workspace", label: "WORKSPACE" },
  { to: "/emulation", label: "EMULATION" },
  { to: "/reports", label: "REPORTS" },
];

function Header() {
  const health = useAnalysisStore((s) => s.health);
  return (
    <header className="flex shrink-0 items-center justify-between border-b border-outline bg-background px-6 py-3">
      <div className="flex items-center gap-8">
        <div className="flex flex-col">
          <span className="font-brand font-display text-2xl font-black leading-none tracking-tight">
            LUMINA
          </span>
          <span className="text-[9px] uppercase tracking-[0.4em] opacity-60">
            Technical Forensics
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                clsx(
                  "px-3 py-1 text-sm font-bold transition-colors",
                  isActive
                    ? "bg-accent-teal text-background"
                    : "text-on-surface-variant hover:text-on-surface"
                )
              }
            >
              [ {n.label} ]
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-6 text-[11px]">
        <div className="flex items-center gap-2">
          <StatusDot ok={!!health?.ok} />
          <span
            className={clsx(
              "uppercase tracking-widest",
              health?.ok ? "text-accent-teal" : "text-terracotta"
            )}
          >
            {health?.ok ? "SYS_ACTIVE" : "SYS_OFFLINE"}
          </span>
        </div>
        <div className="border-l border-outline pl-6 text-right">
          <span className="block font-bold">OP: ANALYST_01</span>
          <span className="block text-on-surface-variant">LEVEL_04_CLEARANCE</span>
        </div>
      </div>
    </header>
  );
}

function StatusBar() {
  const { health, stage, currentApk } = useAnalysisStore();
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-outline bg-surface-container-low px-6 text-[10px] uppercase tracking-widest text-on-surface-variant">
      <div className="flex items-center gap-6">
        <span className="text-accent-teal">STATUS: {stage}</span>
        <span>ADB: {health?.frida ? "READY" : "—"}</span>
        {currentApk && <span className="truncate">TARGET: {currentApk.fileName}</span>}
      </div>
      <div className="flex items-center gap-6">
        <span className="text-accent-teal">SECURE_CHANNEL: AES-256-GCM</span>
        <span>Lumina_OS v0.1.0</span>
      </div>
    </footer>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-on-surface">
      <div className="scanline" aria-hidden />
      <Header />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <StatusBar />
    </div>
  );
}

export { Icon };
