import { create } from "zustand";
import type {
  AnalysisReport,
  ApkMeta,
  AnalysisStage,
  RuntimeEvent,
  ServiceHealth,
} from "@/lib/types";
import * as api from "@/lib/api";

/** A faux-determinate progress bar for the (blocking) backend operations. */
export interface Progress {
  active: boolean;
  value: number; // 0..100
  label: string;
}

interface AnalysisState {
  health: ServiceHealth | null;
  currentApk: ApkMeta | null;
  report: AnalysisReport | null;
  reports: ApkMeta[];
  stage: AnalysisStage;
  progressLog: string[];
  runtimeEvents: RuntimeEvent[];
  progress: Progress;
  busy: boolean;
  error: string | null;

  refreshHealth: () => Promise<void>;
  refreshReports: () => Promise<void>;
  selectApk: () => Promise<void>;
  analyze: (apkId?: string) => Promise<void>;
  runDynamic: (apkId?: string) => Promise<void>;
  loadReport: (apkId: string) => Promise<void>;
  pushRuntimeEvent: (e: RuntimeEvent) => void;
  pushProgress: (msg: string) => void;
  beginProgress: (phases: string[]) => void;
  setProgressLabel: (label: string) => void;
  finishProgress: () => void;
  failProgress: () => void;
  reset: () => void;
}

// Interval driving the asymptotic progress ramp (module-scoped: one at a time).
let progressTimer: ReturnType<typeof setInterval> | null = null;
function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  health: null,
  currentApk: null,
  report: null,
  reports: [],
  stage: "IDLE",
  progressLog: [],
  runtimeEvents: [],
  progress: { active: false, value: 0, label: "" },
  busy: false,
  error: null,

  refreshHealth: async () => {
    try {
      set({ health: await api.serviceHealth() });
    } catch (e) {
      set({ health: { ok: false, version: "?", androguard: false, jadx: false, frida: false, llm: false } });
    }
  },

  refreshReports: async () => {
    try {
      set({ reports: await api.listReports() });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  selectApk: async () => {
    set({ error: null });
    const path = await api.pickApk();
    if (!path) return;
    set({ busy: true, stage: "UPLOADING", progressLog: ["Ingesting APK…"] });
    get().beginProgress(["Hashing artifact…", "Copying into workspace…", "Parsing manifest…"]);
    try {
      const meta = await api.ingestApk(path);
      get().finishProgress();
      set({ currentApk: meta, busy: false, stage: "IDLE" });
    } catch (e) {
      get().failProgress();
      set({ error: String(e), busy: false, stage: "ERROR" });
    }
  },

  analyze: async (apkId) => {
    const id = apkId ?? get().currentApk?.id;
    if (!id) {
      set({ error: "No APK selected." });
      return;
    }
    set({ busy: true, error: null, stage: "STATIC_PARSING", runtimeEvents: [] });
    get().beginProgress([
      "Static parsing (Androguard)…",
      "Decompiling flagged classes (JADX)…",
      "IoC extraction & signatures…",
      "Gen-AI synthesis…",
      "Risk scoring & report…",
    ]);
    try {
      const report = await api.runAnalysis(id);
      get().finishProgress();
      set({ report, stage: report.stage, busy: false, currentApk: report.meta });
      get().refreshReports();
    } catch (e) {
      get().failProgress();
      set({ error: String(e), busy: false, stage: "ERROR" });
    }
  },

  runDynamic: async (apkId) => {
    const id = apkId ?? get().currentApk?.id;
    if (!id) return;
    set({ busy: true, error: null, stage: "DYNAMIC_EMULATION" });
    get().beginProgress([
      "Booting sandboxed emulator…",
      "Installing target via ADB…",
      "Attaching Frida hooks…",
      "Capturing runtime trace…",
      "Re-scoring with dynamic evidence…",
    ]);
    try {
      const report = await api.runDynamicAnalysis(id);
      get().finishProgress();
      set({ report, stage: report.stage, busy: false });
    } catch (e) {
      get().failProgress();
      set({ error: String(e), busy: false, stage: "ERROR" });
    }
  },

  loadReport: async (apkId) => {
    set({ busy: true, error: null });
    try {
      const report = await api.getReport(apkId);
      set({ report, currentApk: report.meta, stage: report.stage, busy: false });
    } catch (e) {
      set({ error: String(e), busy: false });
    }
  },

  pushRuntimeEvent: (e) =>
    set((s) => ({ runtimeEvents: [...s.runtimeEvents, e] })),
  pushProgress: (msg) =>
    set((s) => ({ progressLog: [...s.progressLog, msg] })),

  // Faux-determinate progress: the backend calls are single blocking requests,
  // so we ramp asymptotically toward 90% across the expected phases and snap to
  // 100% on completion. `setProgressLabel` lets live pipeline events refine it.
  beginProgress: (phases) => {
    stopProgressTimer();
    set({ progress: { active: true, value: 4, label: phases[0] ?? "Working…" } });
    progressTimer = setInterval(() => {
      const p = get().progress;
      if (!p.active) return stopProgressTimer();
      const value = Math.min(90, p.value + (90 - p.value) * 0.08 + 0.5);
      const idx = Math.min(phases.length - 1, Math.floor((value / 90) * phases.length));
      set({ progress: { active: true, value, label: phases[idx] ?? p.label } });
    }, 220);
  },
  setProgressLabel: (label) =>
    set((s) => (s.progress.active ? { progress: { ...s.progress, label } } : {})),
  finishProgress: () => {
    stopProgressTimer();
    set((s) => ({ progress: { ...s.progress, active: true, value: 100, label: "Complete" } }));
    setTimeout(() => set({ progress: { active: false, value: 0, label: "" } }), 450);
  },
  failProgress: () => {
    stopProgressTimer();
    set({ progress: { active: false, value: 0, label: "" } });
  },

  reset: () =>
    set({ currentApk: null, report: null, stage: "IDLE", progressLog: [], runtimeEvents: [], error: null }),
}));
