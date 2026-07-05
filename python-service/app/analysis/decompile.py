"""JADX wrapper — the "Surgeon" (semantic layer).

Implements the Great Hybrid Workflow: Androguard flags high-signal classes,
then JADX is triggered to decompile only those, keeping the Gen-AI context
window small. If the jadx CLI is not installed, decompilation is skipped and
the pipeline continues on Androguard output.
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from .. import config
from ..models import ApkMeta, StaticResult


def _resolve_jadx() -> str | None:
    """Locate the jadx launcher. Accepts an absolute path (e.g. the bundled
    resources/tools/jadx/bin/jadx[.bat]) or a bare name on PATH."""
    p = Path(config.JADX_PATH)
    if p.is_absolute():
        return str(p) if p.exists() else None
    return shutil.which(config.JADX_PATH)


def _launcher(jadx: str) -> list[str]:
    """Windows .bat launchers must be invoked through cmd.exe."""
    if os.name == "nt" and jadx.lower().endswith(".bat"):
        return ["cmd", "/c", jadx]
    return [jadx]


def decompile(meta: ApkMeta, static: StaticResult) -> list[str]:
    """Decompile the APK (optionally targeting flagged classes) with JADX.
    Returns the list of produced .java file paths (relative to workspace)."""
    jadx = _resolve_jadx()
    if not jadx:
        print("[decompile] jadx not found (bundled or on PATH); skipping decompilation")
        return []

    out_dir = config.WORKSPACE / meta.id / "sources"
    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        *_launcher(jadx),
        "--no-res",             # skip resources, we only want source
        "-d", str(out_dir),
        meta.path,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=False)
    except Exception as exc:  # noqa: BLE001
        print(f"[decompile] jadx failed: {exc}")
        return []

    java_files = [
        str(p.relative_to(out_dir))
        for p in out_dir.rglob("*.java")
    ]
    # Prefer the app's own package files; drop third-party libs to save context.
    pkg_prefix = (meta.package_name or "").split(".")[0]
    if pkg_prefix:
        own = [f for f in java_files if pkg_prefix in f]
        if own:
            java_files = own
    return java_files[: config.MAX_DECOMPILE_CLASSES]


def read_snippets(meta: ApkMeta, files: list[str], limit_chars: int = 8000) -> str:
    """Concatenate (minified) decompiled sources for the Gen-AI context."""
    out_dir = config.WORKSPACE / meta.id / "sources"
    buf: list[str] = []
    total = 0
    for rel in files:
        p = out_dir / rel
        try:
            text = p.read_text("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            continue
        # crude minification: strip blank lines & leading whitespace
        text = "\n".join(
            line.strip() for line in text.splitlines() if line.strip()
        )
        chunk = f"// FILE: {rel}\n{text}\n"
        buf.append(chunk)
        total += len(chunk)
        if total >= limit_chars:
            break
    return "".join(buf)[:limit_chars]


def _windows(text: str, hits: list[str], window: int) -> str:
    """Extract only the lines around each keyword hit (± ``window`` lines),
    merging adjacent regions. This keeps the LLM context focused on evidence
    instead of dumping whole files."""
    lines = text.splitlines()
    lows = [ln.lower() for ln in lines]
    needles = [h.lower() for h in hits if h]
    keep: set[int] = set()
    for idx, low in enumerate(lows):
        if any(n in low for n in needles):
            for j in range(max(0, idx - window), min(len(lines), idx + window + 1)):
                keep.add(j)
    if not keep:
        # No line-level hit (matched token may be split across the class) —
        # fall back to the first non-blank lines so the file isn't empty.
        return "\n".join(ln.strip() for ln in lines if ln.strip())[:1200]
    out: list[str] = []
    prev: int | None = None
    for j in sorted(keep):
        if prev is not None and j != prev + 1:
            out.append("    // …")
        stripped = lines[j].strip()
        if stripped:
            out.append(stripped)
        prev = j
    return "\n".join(out)


def select_evidence(
    meta: ApkMeta,
    static: StaticResult,
    files: list[str],
    *,
    budget_chars: int = 6000,
    max_files: int = 8,
    window_lines: int = 6,
) -> str:
    """Signal-ranked evidence selection for the Gen-AI context.

    Rather than dumping the first N decompiled files, score every file by how
    many high-signal API needles and extracted IoC values it contains, then
    emit match-centered windows from the highest-scoring files only. This keeps
    the LLM payload small (fast, cheaper) *and* more relevant (accurate)."""
    out_dir = config.WORKSPACE / meta.id / "sources"
    from .static_analysis import SUSPICIOUS_APIS

    needles = [n for n in SUSPICIOUS_APIS.keys()]
    ioc_values = [i.value for i in static.iocs][:60]
    terms = [(t, 3) for t in needles] + [(v, 2) for v in ioc_values]

    scored: list[tuple[int, str, str, list[str]]] = []
    for rel in files:
        p = out_dir / rel
        try:
            text = p.read_text("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            continue
        low = text.lower()
        score = 0
        hits: list[str] = []
        for term, weight in terms:
            if term and term.lower() in low:
                score += weight
                hits.append(term)
        if score:
            scored.append((score, rel, text, hits))

    scored.sort(key=lambda x: x[0], reverse=True)
    if not scored:
        # Nothing matched — degrade to compact whole-file snippets.
        return read_snippets(meta, files[:max_files], limit_chars=budget_chars)

    buf: list[str] = []
    total = 0
    for _score, rel, text, hits in scored[:max_files]:
        snippet = _windows(text, hits, window_lines)
        if not snippet:
            continue
        tags = ", ".join(sorted(set(hits))[:8])
        chunk = f"// FILE: {rel}  (signals: {tags})\n{snippet}\n"
        buf.append(chunk)
        total += len(chunk)
        if total >= budget_chars:
            break
    return "".join(buf)[:budget_chars]
