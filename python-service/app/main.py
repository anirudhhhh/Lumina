"""FastAPI entrypoint for the Lumina analysis microservice.

Exposes the REST surface the Tauri Rust core proxies to. Runs on
127.0.0.1:8756 (see src-tauri/src/python.rs).
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__, config, settings, store
from .analysis import chat, genai, llm
from .models import (
    AnalysisReport,
    AnalyzeRequest,
    ApkMeta,
    ChatRequest,
    ChatResponse,
    IngestRequest,
    ServiceHealth,
    SettingsPatch,
    SettingsView,
    TestProviderRequest,
    TestProviderResult,
)
from .pipeline import run_ai, run_dynamic, run_full, run_static

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
    from .analysis.decompile import _resolve_jadx
    return {
        "androguard": has_androguard,
        "jadx": _resolve_jadx() is not None,
        "frida": has_frida,
        "llm": genai.llm_available(),
    }


@app.get("/health", response_model=ServiceHealth)
def health() -> ServiceHealth:
    flags = _engine_flags()
    desc = llm.describe()
    return ServiceHealth(
        ok=True,
        version=__version__,
        provider=desc["provider"],
        model=desc["model"],
        **flags,
    )


# --- settings (bring-your-own-key provider config) ---

@app.get("/settings", response_model=SettingsView)
def get_settings() -> SettingsView:
    return SettingsView.model_validate(settings.public_view())


@app.post("/settings", response_model=SettingsView)
def update_settings(patch: SettingsPatch) -> SettingsView:
    return SettingsView.model_validate(
        settings.update(patch.model_dump(by_alias=True, exclude_none=True))
    )


@app.post("/settings/test", response_model=TestProviderResult)
def test_provider(req: TestProviderRequest) -> TestProviderResult:
    cfg = settings.provider_config(req.provider)
    if not cfg.get("apiKey"):
        return TestProviderResult(
            ok=False, provider=req.provider, model=cfg["model"],
            message="No API key configured for this provider.",
        )
    try:
        out = llm.complete(
            [{"role": "user", "content": "Reply with the single word: OK"}],
            provider=req.provider,
            temperature=0.0,
            max_tokens=5,
        )
        return TestProviderResult(
            ok=True, provider=req.provider, model=cfg["model"],
            message=f"Connected — model responded: {out.strip()[:40] or 'OK'}",
        )
    except Exception as exc:  # noqa: BLE001
        return TestProviderResult(
            ok=False, provider=req.provider, model=cfg["model"],
            message=f"Connection failed: {exc}",
        )


# --- interactive analyst chat ---

@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest) -> ChatResponse:
    desc = llm.describe()
    if not desc["hasKey"]:
        raise HTTPException(
            status_code=400,
            detail="No LLM provider configured. Add an API key in Settings.",
        )
    try:
        text = chat.reply(
            [m.model_dump() for m in req.messages],
            apk_id=req.apk_id,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=str(exc))
    return ChatResponse(reply=text, provider=desc["provider"], model=desc["model"])


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
    """Fast path: structural parse + JADX decompilation + preliminary risk.

    Persisted immediately so the frontend can render the decompiled sources and
    findings while the (slower) AI synthesis runs as a separate /analyze/ai call."""
    from datetime import datetime, timezone

    from .analysis import risk

    meta = _require_meta(req.apk_id)
    static = run_static(meta)
    report = AnalysisReport(
        meta=meta,
        stage="STATIC_PARSING",
        risk=risk.score(static, None),
        static=static,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    store.put_report(report)
    return report


@app.post("/analyze/ai", response_model=AnalysisReport)
def analyze_ai(req: AnalyzeRequest) -> AnalysisReport:
    """Second phase: Gen-AI synthesis + final risk on an already-parsed sample.
    Runs run_static first if no static report exists yet."""
    report = store.get_report(req.apk_id)
    if report is None:
        meta = _require_meta(req.apk_id)
        report = run_full(meta)
        store.put_report(report)
        return report
    report = run_ai(report)
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


@app.post("/analyze/dynamic/start")
def analyze_dynamic_start(req: AnalyzeRequest) -> dict:
    """Begin a background dynamic run and return immediately. The frontend polls
    /analyze/dynamic/events to stream the live runtime trace, then fetches the
    finalized report once the run completes."""
    from .analysis import dynamic

    report = store.get_report(req.apk_id)
    if report is None:
        meta = _require_meta(req.apk_id)
        report = run_full(meta)
        store.put_report(report)
    return dynamic.start(report)


@app.get("/analyze/dynamic/events/{apk_id}")
def analyze_dynamic_events(apk_id: str, cursor: int = 0) -> dict:
    from .analysis import dynamic

    return dynamic.poll(apk_id, cursor)


@app.get("/report/{apk_id}", response_model=AnalysisReport)
def get_report(apk_id: str) -> AnalysisReport:
    report = store.get_report(apk_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    return report


@app.get("/reports", response_model=list[ApkMeta])
def list_reports() -> list[ApkMeta]:
    return store.list_metas()


@app.get("/workspace/{apk_id}/file")
def read_source_file(apk_id: str, path: str) -> dict:
    """Return the text of a decompiled source file under the sample's workspace.
    Path-traversal is prevented by resolving against the sources root."""
    root = (config.WORKSPACE / apk_id / "sources").resolve()
    try:
        target = (root / path).resolve()
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="invalid path")
    if root not in target.parents and target != root:
        raise HTTPException(status_code=403, detail="path outside workspace")
    if not target.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    try:
        raw = target.read_text("utf-8", "ignore")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"read failed: {exc}")
    limit = 200_000
    truncated = len(raw) > limit
    return {"path": path, "content": raw[:limit], "truncated": truncated}


@app.post("/report/{apk_id}/export")
def export_report(apk_id: str) -> dict:
    report = store.get_report(apk_id)
    if report is None:
        raise HTTPException(status_code=404, detail="report not found")
    out = config.WORKSPACE / apk_id / "report.json"
    out.write_text(report.model_dump_json(by_alias=True, indent=2), "utf-8")
    return {"path": str(out)}
