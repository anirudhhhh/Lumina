"""Frozen entrypoint for the Lumina analysis service.

When the desktop app is packaged, the whole Python service (interpreter +
FastAPI + Androguard + all deps) is compiled into a single self-contained
executable with PyInstaller — the end user installs **nothing**. This module is
that executable's entrypoint: it simply boots uvicorn in-process.

In development the Rust core launches `python -m uvicorn app.main:app` instead
(see src-tauri/src/python.rs), so this file is only exercised by the frozen
build, but it also works when run directly: `python run_service.py`.
"""
from __future__ import annotations

import os


def main() -> None:
    import uvicorn

    host = os.environ.get("LUMINA_SERVICE_HOST", "127.0.0.1")
    port = int(os.environ.get("LUMINA_SERVICE_PORT", "8756"))
    # Import the app object directly (not by string) so PyInstaller's dependency
    # graph picks everything up and no reload/worker subprocess is needed.
    from app.main import app

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
