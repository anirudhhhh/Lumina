import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Module, Icon, verdictColor, Spinner } from "@/components/primitives";
import { useAnalysisStore } from "@/store/useAnalysisStore";

export default function Dashboard() {
  const nav = useNavigate();
  const { report, reports, health, busy, stage, selectApk, analyze, currentApk, loadReport } =
    useAnalysisStore();

  const risk = report?.risk;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-on-surface-variant">
        <span>&gt; LUMINA_ROOT / ANALYTICS / DASHBOARD_MAIN</span>
        <span>PS1: Fraudulent APK &amp; Malware Analysis</span>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* RISK PROFILE */}
        <Module label="MODULE: RISK_HEURISTICS" labelColor="text-terracotta" className="col-span-12 lg:col-span-8">
          <div className="flex flex-col gap-10 md:flex-row">
            <div
              className={clsx(
                "relative flex h-48 w-48 flex-shrink-0 flex-col items-center justify-center border",
                risk ? verdictColor(risk.verdict).replace("text", "border") : "border-outline-variant"
              )}
            >
              <div className="absolute inset-2 border border-dashed border-terracotta/30" />
              <span className={clsx("text-5xl font-black", risk && verdictColor(risk.verdict))}>
                {risk ? risk.score : "--"}
              </span>
              <span className={clsx("mt-1 text-[10px] font-bold", risk && verdictColor(risk.verdict))}>
                {risk ? risk.verdict : "NO_TARGET"}
              </span>
            </div>
            <div className="flex-1 space-y-6">
              <div>
                <div className="mb-2 text-[10px] uppercase text-on-surface-variant">
                  Primary Detection Vector
                </div>
                <div className="tui-border border-accent-teal/20 bg-surface p-3 text-sm text-accent-teal">
                  {report?.static.findings[0]?.category ?? "awaiting_analysis"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="tui-border p-3">
                  <div className="mb-1 text-[9px] uppercase text-on-surface-variant">Confidence</div>
                  <div className="text-xl font-bold">
                    {risk ? `${(risk.confidence * 100).toFixed(1)}%` : "--"}
                  </div>
                </div>
                <div className="tui-border p-3">
                  <div className="mb-1 text-[9px] uppercase text-on-surface-variant">Flag_Count</div>
                  <div className="text-xl font-bold">
                    {report ? `${report.static.findings.length}_OBJ` : "0_OBJ"}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button className="tui-btn" disabled={busy} onClick={() => analyze()}>
              {busy ? "RUNNING…" : "RUN_ANALYSIS"}
            </button>
          </div>
        </Module>

        {/* ACTIVE SIGNATURES */}
        <Module label="SIG_DB_V2.0" className="col-span-12 lg:col-span-4">
          <div className="mt-2 space-y-3">
            {(report?.static.findings ?? []).slice(0, 5).map((f) => (
              <div
                key={f.id}
                className={clsx(
                  "flex items-center justify-between p-3",
                  f.severity === "CRITICAL" || f.severity === "HIGH"
                    ? "tui-border-error bg-terracotta/5"
                    : "tui-border bg-surface"
                )}
              >
                <span
                  className={clsx(
                    "text-xs font-bold",
                    (f.severity === "CRITICAL" || f.severity === "HIGH") && "text-terracotta"
                  )}
                >
                  {f.category}
                </span>
                <Icon name="priority_high" className="text-sm" />
              </div>
            ))}
            {!report && (
              <div className="py-8 text-center text-xs text-on-surface-variant">
                No signatures. Upload an artifact to begin.
              </div>
            )}
          </div>
          <button
            onClick={() => nav("/reports")}
            className="mt-6 w-full border border-dashed tui-border py-2 text-[10px] font-bold uppercase text-on-surface-variant hover:text-on-surface"
          >
            EXPAND_FULL_REPORT.TXT
          </button>
        </Module>

        {/* ARTIFACT QUEUE */}
        <Module label="ARTIFACT_QUEUE" className="col-span-12 lg:col-span-8 !p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline">
                  {["Artifact_ID", "Package", "State", "Risk_Lvl"].map((h) => (
                    <th key={h} className="p-4 text-[10px] uppercase text-on-surface-variant">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline/30">
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-xs text-on-surface-variant">
                      Queue empty.
                    </td>
                  </tr>
                )}
                {reports.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => {
                      loadReport(m.id);
                      nav("/workspace");
                    }}
                    className="group cursor-pointer hover:bg-surface-container"
                  >
                    <td className="flex items-center gap-2 p-4 text-xs">
                      <span className="text-accent-teal group-hover:animate-pulse">&gt;</span>
                      {m.fileName}
                    </td>
                    <td className="p-4 text-xs opacity-60">{m.packageName ?? "—"}</td>
                    <td className="p-4 text-xs text-accent-teal">PARSED</td>
                    <td className="p-4">
                      <span className="tui-tag border-accent-teal text-accent-teal">READY</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Module>

        {/* ENGINE STATUS */}
        <div className="col-span-12 space-y-6 lg:col-span-4">
          <Module label="ENGINE_STATUS" labelColor="text-accent-teal">
            <div className="space-y-4">
              <EngineRow label="Androguard" ok={!!health?.androguard} note="STRUCTURAL" />
              <EngineRow label="JADX" ok={!!health?.jadx} note="DECOMPILER" />
              <EngineRow label="Frida_Srv" ok={!!health?.frida} note="P:27042" />
              <EngineRow label="LLM_Core" ok={!!health?.llm} note={health?.llm ? "ONLINE" : "NOT_CONFIGURED"} />
            </div>
          </Module>
          <button
            onClick={selectApk}
            disabled={busy}
            className="tui-btn-primary w-full py-4 disabled:opacity-50"
          >
            {stage === "UPLOADING" ? "INGESTING…" : "UPLOAD_NEW_ARTIFACT (APK)"}
          </button>
          {currentApk && !report && (
            <div className="tui-border p-3 text-[11px]">
              <div className="text-accent-teal">TARGET_READY</div>
              <div className="mt-1 truncate opacity-70">{currentApk.fileName}</div>
              <div className="opacity-50">sha256: {currentApk.sha256.slice(0, 24)}…</div>
            </div>
          )}
          {busy && stage !== "UPLOADING" && <Spinner label={`stage: ${stage}`} />}
        </div>
      </div>
    </div>
  );
}

function EngineRow({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="block text-[9px] uppercase text-on-surface-variant">{label}</span>
        <span className={clsx("text-xs font-bold", ok ? "text-accent-teal" : "text-on-surface-variant")}>
          {ok ? `CONNECTED [${note}]` : `OFFLINE [${note}]`}
        </span>
      </div>
      <div className="h-1 w-12 overflow-hidden bg-on-surface-variant/20">
        <div className={clsx("h-full", ok ? "w-full bg-accent-teal animate-pulse" : "w-1/4 bg-on-surface-variant")} />
      </div>
    </div>
  );
}
