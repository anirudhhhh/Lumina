"""Runtime configuration for the analysis service (env-driven)."""
from __future__ import annotations

import os
from pathlib import Path

# Workspace where ingested APKs, decompiled sources and reports are stored.
WORKSPACE = Path(os.environ.get("LUMINA_WORKSPACE", Path.home() / ".lumina" / "workspace"))
WORKSPACE.mkdir(parents=True, exist_ok=True)

# Optional path to the jadx CLI (jadx or jadx.bat). If unset, decompilation is
# skipped gracefully and the pipeline still runs on Androguard output.
JADX_PATH = os.environ.get("LUMINA_JADX_PATH", "jadx")

# LLM configuration. Supports any OpenAI-compatible endpoint (OpenAI, Azure,
# local llama.cpp / Ollama with an OpenAI shim, etc.).
LLM_API_KEY = os.environ.get("LUMINA_LLM_API_KEY", "")
LLM_BASE_URL = os.environ.get("LUMINA_LLM_BASE_URL", "https://api.openai.com/v1")
LLM_MODEL = os.environ.get("LUMINA_LLM_MODEL", "gpt-4o-mini")

# Frida / emulator (dynamic analysis).
#   LUMINA_DYNAMIC_MODE: auto | real | simulate
#     auto     — use a live device+frida if reachable, else simulate (default)
#     real     — require a live device; error if none
#     simulate — always produce the deterministic simulated trace
FRIDA_ENABLED = os.environ.get("LUMINA_FRIDA", "0") == "1"
DYNAMIC_MODE = os.environ.get("LUMINA_DYNAMIC_MODE", "real" if FRIDA_ENABLED else "auto")

# Path to the `adb` executable. If unset, a bundled adb (resources/tools) or a
# system adb on PATH is used. Set by the Rust core when the platform-tools pack
# is present (LUMINA_ADB_PATH).
ADB_PATH = os.environ.get("LUMINA_ADB_PATH", "adb")

# Optional path to a frida-server binary to push to the guest. If unset, the
# engine downloads the build matching the installed frida version + guest arch.
FRIDA_SERVER_PATH = os.environ.get("LUMINA_FRIDA_SERVER_PATH", "")

# How long (seconds) to sample runtime behaviour after spawning the target.
DYNAMIC_SAMPLE_SECONDS = int(os.environ.get("LUMINA_DYNAMIC_SECONDS", "20"))

# Where downloaded frida-server binaries are cached (per arch).
CACHE_DIR = Path(os.environ.get("LUMINA_CACHE", Path.home() / ".lumina" / "cache"))

MAX_DECOMPILE_CLASSES = int(os.environ.get("LUMINA_MAX_DECOMPILE_CLASSES", "40"))
