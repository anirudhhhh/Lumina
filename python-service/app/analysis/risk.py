"""Phase 6 — weighted risk scoring & threat classification.

Combines dangerous permissions, suspicious API findings, IoC reputation and
(when present) dynamic confirmations into a single 0-100 score and a
Benign / Suspicious / Malicious verdict.
"""
from __future__ import annotations

from ..models import (
    AnalysisReport,
    DynamicResult,
    RiskFactor,
    RiskScore,
    StaticResult,
)

SEVERITY_WEIGHT = {"LOW": 4, "MEDIUM": 10, "HIGH": 20, "CRITICAL": 30}


def score(static: StaticResult, dynamic: DynamicResult | None = None) -> RiskScore:
    factors: list[RiskFactor] = []
    raw = 0.0

    # 1. Findings contribute by severity * confidence.
    for f in static.findings:
        contrib = SEVERITY_WEIGHT.get(f.severity, 5) * f.confidence
        raw += contrib
        factors.append(RiskFactor(label=f"{f.category} ({f.severity})", weight=contrib))

    # 2. Dangerous permissions.
    dangerous = [p for p in static.permissions if p.dangerous]
    if dangerous:
        contrib = min(20, len(dangerous) * 3)
        raw += contrib
        factors.append(
            RiskFactor(label=f"{len(dangerous)} dangerous permissions", weight=contrib)
        )

    # 3. Blacklisted / suspicious IoCs.
    bad_iocs = [i for i in static.iocs if i.reputation in ("BLACKLISTED", "SUSPICIOUS")]
    if bad_iocs:
        contrib = min(20, len(bad_iocs) * 6)
        raw += contrib
        factors.append(
            RiskFactor(label=f"{len(bad_iocs)} suspicious network IoCs", weight=contrib)
        )

    # 4. Dynamic confirmations boost confidence heavily.
    dyn_boost = 0.0
    if dynamic and dynamic.confirmed_findings:
        dyn_boost = min(25, len(dynamic.confirmed_findings) * 10)
        raw += dyn_boost
        factors.append(
            RiskFactor(label="Runtime-confirmed malicious behavior", weight=dyn_boost)
        )

    final = int(max(0, min(100, round(raw))))

    if final >= 70:
        verdict = "MALICIOUS"
    elif final >= 35:
        verdict = "SUSPICIOUS"
    else:
        verdict = "BENIGN"

    # Confidence: more evidence + dynamic validation => higher confidence.
    evidence_count = len(static.findings) + len(bad_iocs)
    confidence = min(0.99, 0.4 + 0.06 * evidence_count + (0.2 if dyn_boost else 0.0))

    # Normalize factor weights to fractions for display.
    total = sum(f.weight for f in factors) or 1.0
    factors = sorted(
        (RiskFactor(label=f.label, weight=round(f.weight / total, 3)) for f in factors),
        key=lambda f: f.weight,
        reverse=True,
    )[:6]

    return RiskScore(score=final, verdict=verdict, confidence=round(confidence, 3), factors=factors)


def rescore(report: AnalysisReport) -> AnalysisReport:
    report.risk = score(report.static, report.dynamic)
    return report
