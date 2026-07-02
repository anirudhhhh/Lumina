"""Structural + heuristic static analysis via Androguard.

Implements phases 1-3 of the PS1 pipeline: permission mapping, IoC/string
extraction, and heuristic signature/evasion detection. Degrades gracefully if
Androguard is unavailable (returns whatever it could compute).
"""
from __future__ import annotations

import re
import uuid
from typing import Optional

from ..models import ApkMeta, Finding, IoC, PermissionFinding, StaticResult

# Permissions that meaningfully raise the risk profile.
DANGEROUS_PERMISSIONS = {
    "android.permission.SEND_SMS",
    "android.permission.RECEIVE_SMS",
    "android.permission.READ_SMS",
    "android.permission.READ_CONTACTS",
    "android.permission.READ_PHONE_STATE",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
    "android.permission.RECORD_AUDIO",
    "android.permission.CAMERA",
    "android.permission.READ_CALL_LOG",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.REQUEST_INSTALL_PACKAGES",
    "android.permission.BIND_ACCESSIBILITY_SERVICE",
    "android.permission.GET_ACCOUNTS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
}

# High-signal API patterns -> (category, severity, weight)
SUSPICIOUS_APIS = {
    "sendTextMessage": ("SMS_HIJACKING", "CRITICAL"),
    "SmsManager": ("SMS_HIJACKING", "CRITICAL"),
    "DexClassLoader": ("DYNAMIC_LOAD", "HIGH"),
    "PathClassLoader": ("DYNAMIC_LOAD", "HIGH"),
    "loadClass": ("REFLECTION", "MEDIUM"),
    "getMethod": ("REFLECTION", "MEDIUM"),
    "Runtime;->exec": ("COMMAND_EXEC", "HIGH"),
    "ProcessBuilder": ("COMMAND_EXEC", "HIGH"),
    "getDeviceId": ("DEVICE_FINGERPRINT", "MEDIUM"),
    "Cipher": ("CRYPTO_USE", "LOW"),
    "javax/crypto": ("CRYPTO_USE", "LOW"),
    "setComponentEnabledSetting": ("HIDE_ICON", "MEDIUM"),
    "isDeviceRooted": ("ROOT_DETECTION", "MEDIUM"),
    "su": ("ROOT_DETECTION", "LOW"),
}

IP_RE = re.compile(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b")
URL_RE = re.compile(r"https?://[\w\-.]+(?::\d+)?(?:/[^\s\"'<>]*)?", re.IGNORECASE)
DOMAIN_RE = re.compile(r"\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b", re.IGNORECASE)
CRYPTO_RE = re.compile(r"\b[A-Fa-f0-9]{32,}\b")

# Domains we never want to flag as IoCs.
BENIGN_DOMAINS = {
    "schemas.android.com", "www.w3.org", "www.google.com", "google.com",
    "gstatic.com", "googleapis.com", "android.com", "github.com",
}


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


def _load_apk(path: str):
    """Return (APK, Analysis) using Androguard, or (None, None) on failure."""
    try:
        from androguard.misc import AnalyzeAPK

        apk, _dex, analysis = AnalyzeAPK(path)
        return apk, analysis
    except Exception as exc:  # noqa: BLE001
        print(f"[static] AnalyzeAPK failed: {exc}")
        try:
            from androguard.core.apk import APK

            return APK(path), None
        except Exception as exc2:  # noqa: BLE001
            print(f"[static] APK parse failed: {exc2}")
            return None, None


def _extract_permissions(apk) -> list[PermissionFinding]:
    perms: list[PermissionFinding] = []
    try:
        for p in apk.get_permissions() or []:
            perms.append(
                PermissionFinding(
                    name=p,
                    dangerous=p in DANGEROUS_PERMISSIONS,
                )
            )
    except Exception:  # noqa: BLE001
        pass
    return perms


def _iter_strings(apk, analysis) -> list[str]:
    strings: list[str] = []
    # Prefer analysis string pool (decoded dex strings).
    if analysis is not None:
        try:
            for s in analysis.get_strings():
                val = s.get_value() if hasattr(s, "get_value") else str(s)
                if val:
                    strings.append(val)
        except Exception:  # noqa: BLE001
            pass
    # Fallback: raw strings from the APK's dex bytes.
    if not strings and apk is not None:
        try:
            for dex in apk.get_all_dex():
                strings.extend(
                    m.decode("latin-1", "ignore")
                    for m in re.findall(rb"[\x20-\x7e]{5,}", dex)
                )
        except Exception:  # noqa: BLE001
            pass
    return strings


def _extract_iocs(strings: list[str]) -> list[IoC]:
    iocs: dict[str, IoC] = {}

    def add(kind, value, rep="UNKNOWN"):
        key = f"{kind}:{value}"
        if key not in iocs:
            iocs[key] = IoC(type=kind, value=value, reputation=rep, source="regex/strings")

    for s in strings:
        for url in URL_RE.findall(s):
            add("URL", url)
        for ip in IP_RE.findall(s):
            add("IP", ip)
        for dom in DOMAIN_RE.findall(s):
            d = dom.lower()
            if d in BENIGN_DOMAINS or d.endswith((".png", ".jpg", ".xml", ".so", ".java")):
                continue
            add("DOMAIN", d, "BENIGN" if d.endswith("google.com") else "UNKNOWN")
    return list(iocs.values())


def _heuristic_findings(apk, analysis, strings: list[str]) -> list[Finding]:
    findings: list[Finding] = []
    seen: set[str] = set()
    haystack = "\n".join(strings)

    # API / signature heuristics from decoded strings + method names.
    method_names = ""
    if analysis is not None:
        try:
            method_names = "\n".join(
                m.get_method().get_name() for m in analysis.get_methods()
            )
        except Exception:  # noqa: BLE001
            method_names = ""

    corpus = haystack + "\n" + method_names
    for needle, (category, severity) in SUSPICIOUS_APIS.items():
        if needle in corpus and category not in seen:
            seen.add(category)
            findings.append(
                Finding(
                    id=_new_id("F"),
                    title=category.replace("_", " ").title(),
                    category=category,
                    severity=severity,  # type: ignore[arg-type]
                    confidence=0.85 if severity in ("CRITICAL", "HIGH") else 0.6,
                    evidence=f"Signature '{needle}' present in binary",
                )
            )

    # Dangerous permission combination: SMS + Internet.
    try:
        perms = set(apk.get_permissions() or [])
        if ({"android.permission.SEND_SMS", "android.permission.RECEIVE_SMS"} & perms) and (
            "android.permission.INTERNET" in perms
        ):
            findings.append(
                Finding(
                    id=_new_id("F"),
                    title="SMS + Internet Permission Combo",
                    category="PERMISSION_COMBO",
                    severity="HIGH",
                    confidence=0.8,
                    evidence="SMS access combined with network egress capability",
                )
            )
    except Exception:  # noqa: BLE001
        pass

    return findings


def run(meta: ApkMeta) -> StaticResult:
    apk, analysis = _load_apk(meta.path)

    if apk is not None:
        try:
            meta.package_name = apk.get_package() or meta.package_name
            meta.version_name = apk.get_androidversion_name() or meta.version_name
            meta.min_sdk = _to_int(apk.get_min_sdk_version())
            meta.target_sdk = _to_int(apk.get_target_sdk_version())
        except Exception:  # noqa: BLE001
            pass

    permissions = _extract_permissions(apk) if apk else []
    strings = _iter_strings(apk, analysis)
    iocs = _extract_iocs(strings)
    findings = _heuristic_findings(apk, analysis, strings) if apk else []

    return StaticResult(
        meta=meta,
        permissions=permissions,
        findings=findings,
        iocs=iocs,
        decompiled_files=[],
    )


def _to_int(v) -> Optional[int]:
    try:
        return int(v) if v is not None else None
    except (TypeError, ValueError):
        return None
