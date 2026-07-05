// Thin wrapper around Tauri IPC commands + service events.
// All heavy lifting happens in the Rust core, which proxies to the Python
// microservice. When running in a plain browser (vite dev without Tauri),
// the calls fall back to mock data so the UI is still explorable.

import type {
  AnalysisReport,
  ApkMeta,
  ChatMessage,
  ChatResponse,
  RuntimeEvent,
  ServiceHealth,
  SettingsPatch,
  SettingsView,
  TestProviderResult,
} from "./types";
import { mockReport, mockHealth, mockSettings } from "./mock";

// Detect whether we're running inside the Tauri webview.
export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

/** Open a native file picker and return the chosen APK path (or null). */
export async function pickApk(): Promise<string | null> {
  if (!isTauri()) {
    return "/mock/com.example.vulnerable_app_v2.1.apk";
  }
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: false,
    filters: [{ name: "Android Package", extensions: ["apk"] }],
  });
  return typeof selected === "string" ? selected : null;
}

/** Register an APK (hash it, copy into workspace) and return its metadata. */
export async function ingestApk(path: string): Promise<ApkMeta> {
  if (!isTauri()) return mockReport().meta;
  return invoke<ApkMeta>("ingest_apk", { path });
}

/** Kick off the full static -> genai -> dynamic pipeline for an APK id. */
export async function runAnalysis(apkId: string): Promise<AnalysisReport> {
  if (!isTauri()) return mockReport();
  return invoke<AnalysisReport>("run_analysis", { apkId });
}

/** Run only static analysis (fast path — decompiles + parses, no AI). */
export async function runStaticAnalysis(apkId: string): Promise<AnalysisReport> {
  if (!isTauri()) return { ...mockReport(), stage: "STATIC_PARSING", ai: undefined };
  return invoke<AnalysisReport>("run_static_analysis", { apkId });
}

/** Second phase: Gen-AI synthesis + final risk on an already-parsed sample. */
export async function runAiAnalysis(apkId: string): Promise<AnalysisReport> {
  if (!isTauri()) return mockReport();
  return invoke<AnalysisReport>("run_ai_analysis", { apkId });
}

/** Read a decompiled source file's text from the sample workspace. */
export async function readSourceFile(
  apkId: string,
  path: string
): Promise<{ path: string; content: string; truncated: boolean }> {
  if (!isTauri())
    return { path, content: "// Source preview requires the desktop app.", truncated: false };
  return invoke("read_source_file", { apkId, path });
}

/** Start dynamic (Frida/emulator) analysis for an already-analyzed APK. */
export async function runDynamicAnalysis(apkId: string): Promise<AnalysisReport> {
  if (!isTauri()) return mockReport();
  return invoke<AnalysisReport>("run_dynamic_analysis", { apkId });
}

export interface DynamicPoll {
  events: RuntimeEvent[];
  cursor: number;
  running: boolean;
  mode: string | null;
  error: string | null;
  finalized: boolean;
}

/** Begin a background, live-streaming dynamic run. */
export async function startDynamicAnalysis(
  apkId: string
): Promise<{ apkId: string; running: boolean; mode: string; cursor: number }> {
  if (!isTauri()) return { apkId, running: true, mode: "simulated", cursor: 0 };
  return invoke("start_dynamic_analysis", { apkId });
}

/** Poll the live runtime-event stream for a running dynamic job. */
export async function pollDynamicEvents(
  apkId: string,
  cursor: number
): Promise<DynamicPoll> {
  if (!isTauri())
    return { events: [], cursor, running: false, mode: "simulated", error: null, finalized: true };
  return invoke("poll_dynamic_events", { apkId, cursor });
}

export async function getReport(apkId: string): Promise<AnalysisReport> {
  if (!isTauri()) return mockReport();
  return invoke<AnalysisReport>("get_report", { apkId });
}

export async function listReports(): Promise<ApkMeta[]> {
  if (!isTauri()) return [mockReport().meta];
  return invoke<ApkMeta[]>("list_reports");
}

export async function serviceHealth(): Promise<ServiceHealth> {
  if (!isTauri()) return mockHealth();
  return invoke<ServiceHealth>("service_health");
}

export async function exportReportPdf(apkId: string): Promise<string> {
  if (!isTauri()) return "/mock/report.pdf";
  return invoke<string>("export_report_pdf", { apkId });
}

// --- Settings (bring-your-own-key provider config) ---

export async function getSettings(): Promise<SettingsView> {
  if (!isTauri()) return mockSettings();
  return invoke<SettingsView>("get_settings");
}

export async function updateSettings(patch: SettingsPatch): Promise<SettingsView> {
  if (!isTauri()) {
    // Reflect the patch onto the mock so the UI still behaves in browser mode.
    return { ...mockSettings(), ...(patch as Partial<SettingsView>) } as SettingsView;
  }
  return invoke<SettingsView>("update_settings", { patch });
}

export async function testProvider(provider: string): Promise<TestProviderResult> {
  if (!isTauri())
    return { ok: false, provider, model: "-", message: "Unavailable in browser preview." };
  return invoke<TestProviderResult>("test_provider", { provider });
}

// --- Interactive analyst chat ---

export async function chat(
  messages: ChatMessage[],
  apkId?: string | null
): Promise<ChatResponse> {
  if (!isTauri()) {
    return {
      reply:
        "(browser preview) Chat needs the Tauri backend + a configured LLM key. " +
        "Run the desktop app (`npm run app:dev`) and set a provider key in Settings.",
      provider: "mock",
      model: "mock",
    };
  }
  return invoke<ChatResponse>("chat", { messages, apkId: apkId ?? null });
}

/** ADB: list attached devices/emulators. */
export async function listDevices(): Promise<string[]> {
  if (!isTauri()) return ["emulator-5554 (mock)"];
  return invoke<string[]>("list_devices");
}

// --- Live event streaming (runtime trace + pipeline progress) ---

export async function onRuntimeEvent(
  cb: (e: RuntimeEvent) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<RuntimeEvent>("runtime-event", (evt) =>
    cb(evt.payload)
  );
  return unlisten;
}

export async function onPipelineProgress(
  cb: (p: { stage: string; message: string }) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ stage: string; message: string }>(
    "pipeline-progress",
    (evt) => cb(evt.payload)
  );
  return unlisten;
}
