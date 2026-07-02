"""In-memory + on-disk registry of ingested APKs and their reports."""
from __future__ import annotations

import json
from pathlib import Path

from . import config
from .models import AnalysisReport, ApkMeta

_metas: dict[str, ApkMeta] = {}
_reports: dict[str, AnalysisReport] = {}


def _report_path(apk_id: str) -> Path:
    d = config.WORKSPACE / apk_id
    d.mkdir(parents=True, exist_ok=True)
    return d / "report.json"


def put_meta(meta: ApkMeta) -> None:
    _metas[meta.id] = meta


def get_meta(apk_id: str) -> ApkMeta | None:
    return _metas.get(apk_id)


def list_metas() -> list[ApkMeta]:
    return list(_metas.values())


def put_report(report: AnalysisReport) -> None:
    _reports[report.meta.id] = report
    _metas[report.meta.id] = report.meta
    try:
        _report_path(report.meta.id).write_text(
            json.dumps(report.model_dump(by_alias=True), indent=2), "utf-8"
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[store] failed to persist report: {exc}")


def get_report(apk_id: str) -> AnalysisReport | None:
    if apk_id in _reports:
        return _reports[apk_id]
    # Try loading from disk (survives service restarts).
    p = _report_path(apk_id)
    if p.exists():
        try:
            data = json.loads(p.read_text("utf-8"))
            report = AnalysisReport.model_validate(data)
            _reports[apk_id] = report
            _metas[apk_id] = report.meta
            return report
        except Exception as exc:  # noqa: BLE001
            print(f"[store] failed to load report: {exc}")
    return None


def bootstrap() -> None:
    """Load any reports already present in the workspace on startup."""
    if not config.WORKSPACE.exists():
        return
    for report_file in config.WORKSPACE.glob("*/report.json"):
        try:
            data = json.loads(report_file.read_text("utf-8"))
            report = AnalysisReport.model_validate(data)
            _reports[report.meta.id] = report
            _metas[report.meta.id] = report.meta
        except Exception:  # noqa: BLE001
            continue
