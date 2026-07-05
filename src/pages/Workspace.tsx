import { useEffect, useState } from "react";
import clsx from "clsx";
import { Icon, SeverityTag } from "@/components/primitives";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { readSourceFile } from "@/lib/api";

const EMPTY_SOURCE = "// Select a decompiled file to view its source.";

export default function Workspace() {
  const { report, stage } = useAnalysisStore();
  const files = report?.static.decompiledFiles ?? [];
  const [active, setActive] = useState(0);
  const [source, setSource] = useState(EMPTY_SOURCE);
  const [loadingSource, setLoadingSource] = useState(false);
  const findings = report?.static.findings ?? [];
  const apkId = report?.meta.id;
  const activeFile = files[active];
  const aiPending = stage === "GENAI_SYNTHESIS";

  // Fetch the actual decompiled source for the selected file.
  useEffect(() => {
    let cancelled = false;
    if (!apkId || !activeFile) {
      setSource(EMPTY_SOURCE);
      return;
    }
    setLoadingSource(true);
    readSourceFile(apkId, activeFile)
      .then((r) => {
        if (!cancelled) setSource(r.content || EMPTY_SOURCE);
      })
      .catch((e) => {
        if (!cancelled) setSource(`// Failed to load ${activeFile}\n// ${String(e)}`);
      })
      .finally(() => {
        if (!cancelled) setLoadingSource(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apkId, activeFile]);

  // Reset selection when a new report loads.
  useEffect(() => {
    setActive(0);
  }, [apkId]);

  return (
    <div className="flex h-full flex-col">
      {/* breadcrumb */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-low px-4 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-outline">PATH:</span>
          <span className="text-on-surface">
            {report ? `/mnt/targets/${report.meta.packageName ?? report.meta.fileName}` : "/mnt/targets/—"}
          </span>
          {report && (
            <span className="ml-4 border border-error/30 bg-error/10 px-2 py-0.5 text-[10px] text-error">
              THREAT_LEVEL: {report.risk.verdict}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* file tree */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-outline-variant bg-surface-container-low">
          <div className="flex h-8 items-center gap-2 border-b border-outline-variant px-4 text-[11px]">
            <Icon name="account_tree" className="text-[14px] text-tertiary" />
            <span>APK_STRUCTURE</span>
          </div>
          <ul className="p-2 text-[12px]">
            {files.length === 0 && (
              <li className="p-3 text-center text-on-surface-variant">No decompiled files.</li>
            )}
            {files.map((f, i) => (
              <li key={f}>
                <button
                  onClick={() => setActive(i)}
                  className={clsx(
                    "flex w-full items-center gap-1 truncate px-2 py-1 text-left hover:bg-surface-container",
                    i === active ? "bg-surface-container-high text-tertiary" : "text-on-surface-variant"
                  )}
                >
                  <span className="text-outline">└─</span>
                  <span className="truncate">{f.split("/").pop()}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* code + findings */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-outline-variant">
          <div className="flex h-8 items-center justify-between border-b border-outline-variant bg-surface-container px-4 text-[11px]">
            <div className="flex items-center gap-2">
              <Icon name="description" className="text-[14px] text-tertiary" />
              <span>SOURCE_VIEW: {files[active]?.split("/").pop() ?? "—"}</span>
            </div>
            <div className="flex gap-3 text-outline">
              <span className="cursor-pointer underline hover:text-on-surface">DECOMPILE</span>
              <span className="cursor-pointer underline hover:text-on-surface">STRINGS</span>
              <span className="text-on-surface">RO</span>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-black/10 p-4">
            <pre className="text-[13px] leading-relaxed">
              <code>{loadingSource ? "// Loading source…" : source}</code>
            </pre>
          </div>

          {/* findings */}
          <div className="flex h-56 flex-col overflow-hidden border-t border-outline-variant">
            <div className="flex h-8 items-center border-b border-outline-variant bg-surface-container px-4 text-[11px]">
              <Icon name="search_check" className="mr-2 text-[14px] text-error" />
              <span>ANALYSIS_FINDINGS: {findings.length}_DETECTED</span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {findings.map((f) => (
                <div
                  key={f.id}
                  className={clsx(
                    "flex items-center gap-3 p-2 tui-border",
                    f.severity === "CRITICAL" || f.severity === "HIGH"
                      ? "border-error/20 bg-error/5"
                      : f.severity === "LOW"
                      ? "border-tertiary/20 bg-tertiary/5"
                      : "bg-surface-container-high"
                  )}
                >
                  <span
                    className={clsx(
                      "font-bold",
                      f.severity === "CRITICAL" || f.severity === "HIGH"
                        ? "text-error"
                        : f.severity === "LOW"
                        ? "text-tertiary"
                        : "text-outline"
                    )}
                  >
                    {f.severity === "LOW" ? "[OK]" : f.severity === "MEDIUM" ? "[??]" : "[!!]"}
                  </span>
                  <div className="flex-1">
                    <div className="text-[11px] font-bold">{f.category}</div>
                    <div className="text-[10px] uppercase text-outline">
                      Confidence: {f.confidence.toFixed(2)} | Impact: {f.severity}
                      {f.file && ` | ${f.file}:${f.line ?? "?"}`}
                    </div>
                  </div>
                  <SeverityTag severity={f.severity} />
                </div>
              ))}
              {findings.length === 0 && (
                <div className="py-8 text-center text-xs text-on-surface-variant">
                  Run analysis to populate findings.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI synthesis */}
        <aside className="flex w-[380px] shrink-0 flex-col overflow-hidden">
          <div className="flex h-8 items-center gap-2 border-b border-outline-variant bg-surface-container px-4 text-[11px]">
            <Icon name="neurology" className="text-[14px] text-sage" />
            <span>AI_SYNTHESIS_EXEC</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs leading-relaxed">
            {aiPending && (
              <div className="tui-border border-sage/30 bg-sage/5 p-3 text-[11px] text-sage">
                <Icon name="progress_activity" className="mr-1 animate-spin text-[13px]" />
                AI synthesis running… decompiled sources are browsable now; the
                report will populate here when it completes.
              </div>
            )}
            {report?.ai ? (
              <>
                <p className="opacity-80">{report.ai.summary}</p>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-sage">Intent</div>
                  <p className="opacity-80">{report.ai.intent}</p>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-widest text-sage">
                    Investigation Plan
                  </div>
                  <ol className="list-decimal space-y-1 pl-4 opacity-80">
                    {report.ai.investigationPlan.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                </div>
                <p className="border-l-2 border-terracotta pl-3 font-bold text-terracotta">
                  REC: {report.ai.recommendation}
                </p>
              </>
            ) : (
              !aiPending && (
                <div className="py-8 text-center text-on-surface-variant">
                  AI synthesis not yet generated.
                </div>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
