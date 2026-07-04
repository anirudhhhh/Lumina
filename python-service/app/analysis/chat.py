"""Interactive analyst chat — a conversational surface over the active LLM.

Backs the Claude-Code-CLI-style chat panel in the UI. The user can ask about a
vulnerability, discuss a loaded report, or request ad-hoc analysis. When an
``apk_id`` is supplied the current report is compacted into the system context
so the model can reason about *that* sample specifically.
"""
from __future__ import annotations

import json

from .. import store
from . import llm

SYSTEM_PROMPT = (
    "You are Lumina, an expert Android malware & fraud reverse-engineering "
    "assistant embedded in a security analyst's desktop tool. Be precise, "
    "technical and concise. Use short paragraphs and terminal-friendly "
    "formatting (plain text, `code`, and simple lists). When asked about a "
    "loaded sample, ground every claim in the provided report evidence and "
    "clearly separate confirmed findings from hypotheses. If you lack "
    "evidence, say so and suggest the next analysis step (a static check, a "
    "Frida hook, an IoC lookup). Never invent findings."
)


def _report_context(apk_id: str) -> str | None:
    """Compact the stored report into a dense evidence block for the model."""
    report = store.get_report(apk_id)
    if report is None:
        return None
    ctx = {
        "package": report.meta.package_name,
        "file": report.meta.file_name,
        "risk": {"score": report.risk.score, "verdict": report.risk.verdict},
        "findings": [
            {"id": f.id, "category": f.category, "severity": f.severity, "evidence": f.evidence}
            for f in report.static.findings
        ],
        "dangerousPermissions": [p.name for p in report.static.permissions if p.dangerous],
        "iocs": [{"type": i.type, "value": i.value, "rep": i.reputation} for i in report.static.iocs],
    }
    if report.ai:
        ctx["aiSummary"] = report.ai.summary
        ctx["aiIntent"] = report.ai.intent
    return json.dumps(ctx)


def reply(messages: list[dict[str, str]], apk_id: str | None = None) -> str:
    """Produce an assistant reply for the given conversation."""
    convo: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if apk_id:
        ctx = _report_context(apk_id)
        if ctx:
            convo.append(
                {
                    "role": "system",
                    "content": "Loaded sample report (JSON evidence):\n" + ctx,
                }
            )
    # Only forward user/assistant turns; ignore any client-side system rows.
    for m in messages:
        role = m.get("role")
        if role in ("user", "assistant") and m.get("content"):
            convo.append({"role": role, "content": m["content"]})
    return llm.complete(convo, temperature=0.4)
