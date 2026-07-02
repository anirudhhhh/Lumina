"""Pydantic models — the JSON contract shared with the Rust core and the React
frontend (src/lib/types.ts). Field names serialize as camelCase via alias."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Verdict = Literal["BENIGN", "SUSPICIOUS", "MALICIOUS", "UNKNOWN"]
Severity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
Stage = Literal[
    "IDLE", "UPLOADING", "STATIC_PARSING", "STATIC_DECOMPILE",
    "GENAI_SYNTHESIS", "DYNAMIC_EMULATION", "REPORTING", "COMPLETE", "ERROR",
]


class Base(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ApkMeta(Base):
    id: str
    file_name: str
    path: str
    sha256: str
    size_bytes: int
    package_name: Optional[str] = None
    version_name: Optional[str] = None
    min_sdk: Optional[int] = None
    target_sdk: Optional[int] = None


class PermissionFinding(Base):
    name: str
    dangerous: bool
    description: Optional[str] = None


class Finding(Base):
    id: str
    title: str
    category: str
    severity: Severity
    confidence: float
    evidence: Optional[str] = None
    file: Optional[str] = None
    line: Optional[int] = None


class IoC(Base):
    type: Literal["URL", "IP", "DOMAIN", "CRYPTO", "CERT"]
    value: str
    reputation: Optional[Literal["BENIGN", "SUSPICIOUS", "BLACKLISTED", "UNKNOWN"]] = "UNKNOWN"
    source: Optional[str] = None


class FridaHook(Base):
    id: str
    target_class: str
    target_method: str
    reason: str
    script: Optional[str] = None


class RuntimeEvent(Base):
    ts: str
    kind: Literal["SYS", "CALL", "NETWORK", "FILE", "HOOK"]
    message: str
    detail: Optional[str] = None
    severity: Optional[Severity] = None


class RiskFactor(Base):
    label: str
    weight: float


class RiskScore(Base):
    score: int
    verdict: Verdict
    confidence: float
    factors: list[RiskFactor] = []


class StaticResult(Base):
    meta: ApkMeta
    permissions: list[PermissionFinding] = []
    findings: list[Finding] = []
    iocs: list[IoC] = []
    decompiled_files: list[str] = []
    call_graph_edges: Optional[list[tuple[str, str]]] = None


class AiSynthesis(Base):
    summary: str
    intent: str
    investigation_plan: list[str] = []
    recommendation: str
    hooks: list[FridaHook] = []


class DynamicResult(Base):
    events: list[RuntimeEvent] = []
    confirmed_findings: list[str] = []
    network_endpoints: list[IoC] = []


class AnalysisReport(Base):
    meta: ApkMeta
    stage: Stage
    risk: RiskScore
    static: StaticResult
    ai: Optional[AiSynthesis] = None
    dynamic: Optional[DynamicResult] = None
    generated_at: str


class ServiceHealth(Base):
    ok: bool
    version: str
    androguard: bool
    jadx: bool
    frida: bool
    llm: bool


# --- request bodies ---

class IngestRequest(Base):
    id: str
    path: str
    sha256: str
    size_bytes: int
    file_name: str


class AnalyzeRequest(Base):
    apk_id: str
