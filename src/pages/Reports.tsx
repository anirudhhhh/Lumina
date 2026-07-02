import clsx from "clsx";
import { Icon, Meter, verdictColor } from "@/components/primitives";
import { useAnalysisStore } from "@/store/useAnalysisStore";
import { exportReportPdf } from "@/lib/api";

export default function Reports() {
  const { report } = useAnalysisStore();

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-on-surface-variant">
        <Icon name="draft" className="text-6xl opacity-40" />
        <p className="text-sm uppercase tracking-widest">No report loaded</p>
        <p className="text-xs">Analyze an artifact from the Dashboard to generate a report.</p>
      </div>
    );
  }

  const { risk, meta } = report;
  const vColor = verdictColor(risk.verdict);
  const iocs = report.static.iocs;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      {/* header */}
      <div className="flex flex-col items-end justify-between gap-4 border-b border-outline-variant pb-8 md:flex-row">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.3em] opacity-50">
            /root/workspace/report
          </div>
          <h1 className="font-display text-5xl text-on-surface md:text-6xl">Analysis Complete</h1>
          <div className="mt-4 flex flex-wrap gap-4 font-code text-xs opacity-60">
            <span className="border tui-border px-2">ID: {meta.id}</span>
            <span>FILE: {meta.fileName}</span>
            <span>HASH: {meta.sha256.slice(0, 12)}…</span>
          </div>
        </div>
        <div className="flex gap-4">
          <button className="tui-btn" onClick={() => window.print()}>[ SHARE ]</button>
          <button className="tui-btn" onClick={() => exportReportPdf(meta.id)}>[ EXPORT_PDF ]</button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* verdict */}
        <div className="col-span-12 space-y-6 lg:col-span-8">
          <div className={clsx("relative overflow-hidden border p-8", vColor.replace("text", "border"))}>
            <div className={clsx("absolute right-0 top-0 px-3 py-1 text-[10px] font-bold text-background", vColor.replace("text", "bg"))}>
              ALERT_LEVEL: {risk.score}
            </div>
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className={clsx("shrink-0 border-4 p-4", vColor.replace("text", "border") + "/20")}>
                <Icon name="warning" className={clsx("text-7xl", vColor)} />
              </div>
              <div className="flex-1">
                <h3 className={clsx("mb-2 text-xs font-bold uppercase tracking-[0.4em]", vColor)}>
                  !! SYSTEM_VERDICT !!
                </h3>
                <div className={clsx("mb-6 text-6xl font-black tracking-tighter", vColor)}>
                  {risk.verdict}
                </div>
                {report.ai && (
                  <div className="space-y-4 border-t border-terracotta/20 pt-4 font-code text-sm leading-relaxed">
                    <p>
                      <span className={vColor}>[ DETECTION ]</span> {report.ai.summary}
                    </p>
                    <p>
                      <span className={vColor}>[ INTENT ]</span> {report.ai.intent}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* evidence / IoCs */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="font-bold text-sage">&gt;&gt;</span>
              <h3 className="text-xs font-bold uppercase tracking-widest">EVIDENCE_ENRICHMENT_LOG</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {iocs.map((ioc, i) => {
                const bad = ioc.reputation === "BLACKLISTED" || ioc.reputation === "SUSPICIOUS";
                return (
                  <div key={i} className="tui-border bg-on-surface/[0.02] p-4">
                    <div className="mb-4 flex items-center justify-between border-b tui-border pb-2">
                      <span className={clsx("text-xs font-bold", bad ? "text-terracotta" : "text-sage")}>
                        [ {bad ? "CRITICAL_NODE" : "BENIGN_NODE"} ]
                      </span>
                      <span className="text-[10px] opacity-50">#{String(i + 1).padStart(3, "0")}</span>
                    </div>
                    <div className="space-y-2 font-code text-xs">
                      <div className="flex justify-between">
                        <span className="opacity-50">{ioc.type}:</span>
                        <span className="text-on-surface">{ioc.value}</span>
                      </div>
                      <div className="flex justify-between border-t border-outline/20 pt-2">
                        <span className="opacity-50">REPUTATION:</span>
                        <span className={clsx("font-bold", bad ? "text-terracotta" : "text-sage")}>
                          {ioc.reputation ?? "UNKNOWN"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* sidebar metrics */}
        <div className="col-span-12 space-y-6 lg:col-span-4">
          <div className="tui-border space-y-8 p-6">
            <div className="flex items-center justify-between border-b tui-border pb-4">
              <h4 className="text-xs font-bold tracking-widest">[ KEY_METRICS ]</h4>
              <Icon name="analytics" className="text-sm opacity-50" />
            </div>
            <Metric label="RISK_SCORE" value={`${risk.score}`} pct={risk.score} color="bg-terracotta" valueColor={vColor} />
            <Metric
              label="CONFIDENCE"
              value={`${(risk.confidence * 100).toFixed(0)}%`}
              pct={risk.confidence * 100}
              color="bg-sage"
            />
            <Metric
              label="FLAGGED_PERMS"
              value={`${report.static.permissions.filter((p) => p.dangerous).length}/${report.static.permissions.length}`}
              pct={
                (report.static.permissions.filter((p) => p.dangerous).length /
                  Math.max(1, report.static.permissions.length)) *
                100
              }
              color="bg-on-surface/40"
            />
          </div>

          {/* risk factors */}
          <div className="tui-border bg-on-surface/[0.03] p-6">
            <div className="mb-4 flex items-center gap-2 border-b tui-border pb-2">
              <Icon name="tune" className="text-xs text-sage" />
              <h4 className="text-[10px] font-bold tracking-widest">CONTRIBUTING_FACTORS</h4>
            </div>
            <div className="space-y-3 text-xs">
              {risk.factors.map((f, i) => (
                <div key={i}>
                  <div className="mb-1 flex justify-between">
                    <span className="opacity-70">{f.label}</span>
                    <span className="font-bold text-sage">{(f.weight * 100).toFixed(0)}%</span>
                  </div>
                  <Meter value={f.weight * 100} color="bg-sage/60" />
                </div>
              ))}
            </div>
          </div>

          {report.ai && (
            <div className="tui-border bg-on-surface/[0.03] p-6">
              <div className="mb-4 flex items-center gap-2 border-b tui-border pb-2">
                <Icon name="terminal" className="text-xs text-sage" />
                <h4 className="text-[10px] font-bold tracking-widest">RECOMMENDATION</h4>
              </div>
              <p className="border-l-2 border-terracotta pl-3 text-xs font-bold leading-relaxed">
                {report.ai.recommendation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  pct,
  color,
  valueColor = "text-on-surface",
}: {
  label: string;
  value: string;
  pct: number;
  color: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="opacity-50">{label}</span>
        <span className={clsx("font-bold", valueColor)}>{value}</span>
      </div>
      <Meter value={pct} color={color} />
    </div>
  );
}
