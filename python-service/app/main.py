"""FastAPI entrypoint for the Lumina analysis microservice.

Exposes the REST surface the Tauri Rust core proxies to. Runs on
127.0.0.1:8756 (see src-tauri/src/python.rs).
"""
from __future__ import annotations

import shutil

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, config, store
from .analysis import genai
from .models import (
    AnalysisReport,
    AnalyzeRequest,
    ApkMeta,
    IngestRequest,
    ServiceHealth,
)
from .pipeline import run_dynamic, run_full, run_static

app = FastAPI(title="Lumina Analysis Service", version=__version__)

# Allow the Tauri webview (tauri://localhost / http://localhost:1420) to call
# the service directly if needed during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    store.bootstrap()


def _engine_flags() -> dict:
    try:
        import androguard  # noqa: F401
        has_androguard = True
    except Exception:  # noqa: BLE001
        has_androguard = False
    try:
        import frida  # noqa: F401
        has_frida = True
    except Exception:  # noqa: BLE001
        has_frida = False
    return {
        "androguard": has_androguard,
        "jadx": shutil.which(config.JADX_PATH) is not None,
        "frida": has_frida,
        "llm": genai.llm_available(),
    }


@app.get("/health", response_model=ServiceHealth)
def health() -> ServiceHealth:
    flags = _engine_flags()
    return ServiceHealth(ok=True, version=__version__, **flags)


@app.post("/ingest", response_model=ApkMeta)
def ingest(req: IngestRequest) -> ApkMeta:
    meta = ApkMeta(
        id=req.id,
        file_name=req.file_name,
        path=req.path,
        sha256=req.sha256,
        size_bytes=req.size_bytes,
    )
    # Enrich metadata via a light Androguard parse.
    try:
        from androguard.core.apk import APK

        apk = APK(req.path)
        meta.package_name = apk.get_package()
        meta.version_name = apk.get_androidversion_name()
    except Exception as exc:  # noqa: BLE001
        print(f"[ingest] metadata enrich skipped: {exc}")
    store.put_meta(meta)
    return meta


def _require_meta(apk_id: str) -> ApkMeta:
    meta = store.get_meta(apk_id)
    if meta is None:
        # maybe a report exists on disk
        report = store.get_report(apk_id)
        if report:
            return report.meta
        raise HTTPException(status_code=404, detail=f"APK {apk_id} not ingested")
    return meta


@app.post("/analyze", response_model=AnalysisReport)
def analyze(req: AnalyzeRequest) -> AnalysisReport:
    meta = _require_meta(req.apk_id)
    report = run_full(meta)
    store.put_report(report)
    return report


@app.post("/analyze/static", response_model=AnalysisReport)
def analyze_static(req: AnalyzeRequest) -> AnalysisReport:
    from .analysis import risk

    meta = _require_meta(req.apk_id)
    static = run_static(meta)
    report = AnalysisReport(
        meta=meta,
        stage="STATIC_PARSING",
        risk=risk.score(static, None),
        static=static,
        generated_at="",
    )
    store.put_report(report)
    return report


@app.post("/analyze/dynamic", response_model=AnalysisReport)
def analyze_dynamic(req: AnalyzeRequest) -> AnalysisReport:
    report = store.get_report(req.apk_id)
    if report is None:
        # Run the full static/AI stage first if not present.
        meta = _require_meta(req.apk_id)
        report = run_full(meta)
    report = run_dynamic(report)
    store.put_report(report)
    return report


@app.get("/report/{apk_id}", response_model=AnalysisReport)
def get_report(apk_id: str) -> AnalysisReport:
    report = store.get_report(apk_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report


@app.get("/reports", response_model=list[ApkMeta])
def list_reports() -> list[ApkMeta]:
    return store.list_metas()


@app.post("/report/{apk_id}/export")
def export_report(apk_id: str) -> dict:
    report = store.get_report(apk_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    out = config.WORKSPACE / apk_id / "report.json"
    out.write_text(report.model_dump_json(by_alias=True, indent=2), "utf-8")
    return {"path": str(out)}
