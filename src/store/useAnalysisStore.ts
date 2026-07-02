import { create } from "zustand";
import type {
  AnalysisReport,
  ApkMeta,
  AnalysisStage,
  RuntimeEvent,
  ServiceHealth,
} from "@/lib/types";
import * as api from "@/lib/api";

interface AnalysisState {
  health: ServiceHealth | null;
  currentApk: ApkMeta | null;
  report: AnalysisReport | null;
  reports: ApkMeta[];
  stage: AnalysisStage;
  progressLog: string[];
  runtimeEvents: RuntimeEvent[];
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
  reset: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  health: null,
  currentApk: null,
  report: null,
  reports: [],
  stage: "IDLE",
  progressLog: [],
  runtimeEvents: [],
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
    try {
      const meta = await api.ingestApk(path);
      set({ currentApk: meta, busy: false, stage: "IDLE" });
    } catch (e) {
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
    try {
      const report = await api.runAnalysis(id);
      set({ report, stage: report.stage, busy: false, currentApk: report.meta });
      get().refreshReports();
    } catch (e) {
      set({ error: String(e), busy: false, stage: "ERROR" });
    }
  },

  runDynamic: async (apkId) => {
    const id = apkId ?? get().currentApk?.id;
    if (!id) return;
    set({ busy: true, error: null, stage: "DYNAMIC_EMULATION" });
    try {
      const report = await api.runDynamicAnalysis(id);
      set({ report, stage: report.stage, busy: false });
    } catch (e) {
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

  reset: () =>
    set({ currentApk: null, report: null, stage: "IDLE", progressLog: [], runtimeEvents: [], error: null }),
}));
