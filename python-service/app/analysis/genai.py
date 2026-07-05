"""Phases 4-5 — Gen-AI context synthesis & behavioral interpretation.

Builds a dense JSON payload from the high-signal static output and asks an
LLM to explain intent, produce an investigation plan and propose Frida hooks.
Works against any OpenAI-compatible endpoint; if no API key is configured it
falls back to a deterministic heuristic synthesis so the pipeline still runs.
"""
from __future__ import annotations

import json
import uuid

from .. import settings
from ..models import AiSynthesis, ApkMeta, FridaHook, StaticResult
from . import llm

# Map suspicious categories to concrete Frida hook targets.
HOOK_TARGETS = {
    "SMS_HIJACKING": ("android.telephony.SmsManager", "sendTextMessage"),
    "DYNAMIC_LOAD": ("dalvik.system.DexClassLoader", "loadClass"),
    "REFLECTION": ("java.lang.reflect.Method", "invoke"),
    "COMMAND_EXEC": ("java.lang.Runtime", "exec"),
    "CRYPTO_USE": ("javax.crypto.Cipher", "doFinal"),
    "ROOT_DETECTION": ("java.lang.Runtime", "exec"),
    "DEVICE_FINGERPRINT": ("android.telephony.TelephonyManager", "getDeviceId"),
}


# Reputation ranking so the most suspicious IoCs survive the cap.
_IOC_ORDER = {"BLACKLISTED": 0, "SUSPICIOUS": 1, "UNKNOWN": 2, "BENIGN": 3}


def _select_iocs(static: StaticResult, limit: int = 30) -> list:
    """Prioritise non-benign indicators and cap the count. A 1 MB APK can yield
    hundreds of domain-like strings; shipping them all bloats the LLM payload
    (the main cause of the analysis stalling) without adding signal."""
    ranked = sorted(
        static.iocs,
        key=lambda i: _IOC_ORDER.get((i.reputation or "UNKNOWN"), 2),
    )
    return ranked[:limit]


def build_context(meta: ApkMeta, static: StaticResult, code: str) -> dict:
    """Phase 4 — bundle high-signal metadata + code into an LLM payload."""
    return {
        "package": meta.package_name,
        "permissions": [p.name for p in static.permissions if p.dangerous],
        "findings": [
            {"category": f.category, "severity": f.severity, "evidence": f.evidence}
            for f in static.findings
        ],
        "iocs": [{"type": i.type, "value": i.value, "rep": i.reputation} for i in _select_iocs(static)],
        "code_excerpt": code,
    }


def generate_hooks(static: StaticResult) -> list[FridaHook]:
    hooks: list[FridaHook] = []
    seen: set[tuple[str, str]] = set()
    for f in static.findings:
        target = HOOK_TARGETS.get(f.category)
        if not target or target in seen:
            continue
        seen.add(target)
        cls, method = target
        hooks.append(
            FridaHook(
                id=f"H-{uuid.uuid4().hex[:4]}",
                target_class=cls,
                target_method=method,
                reason=f"Validate {f.category} at runtime (from {f.id})",
                script=_frida_script(cls, method),
            )
        )
    return hooks


def _frida_script(cls: str, method: str) -> str:
    return (
        "Java.perform(function () {\n"
        f"  var C = Java.use('{cls}');\n"
        f"  C.{method}.overloads.forEach(function (ov) {{\n"
        "    ov.implementation = function () {\n"
        f"      send({{hook: '{cls}.{method}', args: Array.prototype.slice.call(arguments).map(String)}});\n"
        "      return ov.apply(this, arguments);\n"
        "    };\n"
        "  });\n"
        "});\n"
    )


def _heuristic_synthesis(ctx: dict, static: StaticResult) -> AiSynthesis:
    cats = [f.category for f in static.findings]
    critical = [f for f in static.findings if f.severity in ("CRITICAL", "HIGH")]
    intent = "Unknown / low-signal"
    if "SMS_HIJACKING" in cats:
        intent = "SMS interception / premium-fraud with data exfiltration"
    elif "DYNAMIC_LOAD" in cats:
        intent = "Staged loader — fetches and executes remote payloads"
    elif "COMMAND_EXEC" in cats:
        intent = "Privilege abuse via shell command execution"
    elif critical:
        intent = "Suspicious behavior warranting manual review"

    summary = (
        f"Static analysis surfaced {len(static.findings)} signature(s) "
        f"({', '.join(sorted(set(cats))) or 'none'}). "
        + ("Dangerous permission set detected. " if ctx["permissions"] else "")
        + (f"{len(ctx['iocs'])} network indicator(s) extracted." if ctx["iocs"] else "")
    )
    plan = [f"Hook {HOOK_TARGETS[c][0]}.{HOOK_TARGETS[c][1]}" for c in dict.fromkeys(cats) if c in HOOK_TARGETS]
    rec = "DO NOT DEPLOY. Quarantine and validate dynamically." if critical else "Proceed with dynamic validation."
    return AiSynthesis(
        summary=summary,
        intent=intent,
        investigation_plan=plan or ["Run baseline dynamic trace to observe behavior"],
        recommendation=rec,
        hooks=generate_hooks(static),
    )


def synthesize(meta: ApkMeta, static: StaticResult, code: str) -> AiSynthesis:
    ctx = build_context(meta, static, code)
    if not llm.available():
        return _heuristic_synthesis(ctx, static)

    system = (
        "You are a senior Android malware reverse engineer. Given structured "
        "static-analysis evidence, respond ONLY with JSON: {summary, intent, "
        "investigationPlan: string[], recommendation}."
    )
    try:
        content = llm.complete(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(ctx)},
            ],
            response_json=True,
            temperature=0.2,
            max_tokens=900,
            timeout=90.0,
        )
        data = json.loads(content or "{}")
        return AiSynthesis(
            summary=data.get("summary", ""),
            intent=data.get("intent", ""),
            investigation_plan=data.get("investigationPlan", []),
            recommendation=data.get("recommendation", ""),
            hooks=generate_hooks(static),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[genai] LLM synthesis failed, using heuristic: {exc}")
        return _heuristic_synthesis(ctx, static)


def llm_available() -> bool:
    return llm.available()
