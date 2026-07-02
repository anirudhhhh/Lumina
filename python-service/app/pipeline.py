"""Orchestrates the end-to-end analysis pipeline (PS1 phases 1-8)."""
from __future__ import annotations

from datetime import datetime, timezone

from .analysis import decompile, dynamic, genai, risk, static_analysis
from .models import AnalysisReport, ApkMeta, StaticResult


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_static(meta: ApkMeta) -> StaticResult:
    """Phases 1-3: structural parse, IoC extraction, heuristic signatures."""
    static = static_analysis.run(meta)
    # Phase 3 (hybrid): decompile flagged classes with JADX.
    static.decompiled_files = decompile.decompile(meta, static)
    return static


def run_full(meta: ApkMeta) -> AnalysisReport:
    """Static -> Gen-AI synthesis -> risk scoring (no emulation yet)."""
    static = run_static(meta)

    # Phases 4-5: Gen-AI context synthesis + behavioral interpretation.
    code = decompile.read_snippets(meta, static.decompiled_files)
    ai = genai.synthesize(meta, static, code)

    # Phase 6: risk scoring.
    score = risk.score(static, None)

    return AnalysisReport(
        meta=meta,
        stage="COMPLETE",
        risk=score,
        static=static,
        ai=ai,
        dynamic=None,
        generated_at=_now_iso(),
    )


def run_dynamic(report: AnalysisReport) -> AnalysisReport:
    """Secure emulation + Frida runtime monitoring, then re-score."""
    dyn = dynamic.run(report.static, report.ai)
    report.dynamic = dyn
    report.stage = "COMPLETE"
    report.risk = risk.score(report.static, dyn)
    report.generated_at = _now_iso()
    return report
