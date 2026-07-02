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

# Frida / emulator
FRIDA_ENABLED = os.environ.get("LUMINA_FRIDA", "0") == "1"

MAX_DECOMPILE_CLASSES = int(os.environ.get("LUMINA_MAX_DECOMPILE_CLASSES", "40"))
