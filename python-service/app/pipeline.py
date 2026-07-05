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


def run_ai(report: AnalysisReport) -> AnalysisReport:
    """Phases 4-6 on an existing static report: Gen-AI synthesis + rescore.

    Split out from ``run_static`` so the caller can persist and surface the
    decompiled sources first (the workspace becomes navigable immediately),
    then run the slower LLM step as a second request."""
    meta, static = report.meta, report.static
    # Signal-ranked, match-centered evidence keeps the LLM payload small & relevant.
    code = decompile.select_evidence(meta, static, static.decompiled_files)
    report.ai = genai.synthesize(meta, static, code)
    report.risk = risk.score(static, report.dynamic)
    report.stage = "COMPLETE"
    report.generated_at = _now_iso()
    return report


def run_full(meta: ApkMeta) -> AnalysisReport:
    """Static -> Gen-AI synthesis -> risk scoring (no emulation yet)."""
    static = run_static(meta)
    report = AnalysisReport(
        meta=meta,
        stage="STATIC_PARSING",
        risk=risk.score(static, None),
        static=static,
        ai=None,
        dynamic=None,
        generated_at=_now_iso(),
    )
    return run_ai(report)


def run_dynamic(report: AnalysisReport) -> AnalysisReport:
    """Secure emulation + Frida runtime monitoring, then re-score."""
    dyn = dynamic.run(report.static, report.ai)
    report.dynamic = dyn
    report.stage = "COMPLETE"
    report.risk = risk.score(report.static, dyn)
    report.generated_at = _now_iso()
    return report
