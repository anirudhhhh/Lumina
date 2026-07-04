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
