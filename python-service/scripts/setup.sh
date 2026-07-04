#!/usr/bin/env bash
# Lumina Python service — one-shot venv setup (macOS / Linux).
# Creates python-service/.venv and installs pinned-range requirements into it.
# The Tauri core auto-detects this .venv and uses it to spawn the service.
set -euo pipefail

SVC="$(cd "$(dirname "$0")/.." && pwd)"   # python-service/
cd "$SVC"

# Prefer a 3.10-3.12 interpreter; fall back to python3.
PY=""
for c in python3.12 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
[ -n "$PY" ] || { echo "No Python interpreter found. Install Python 3.10-3.12."; exit 1; }

echo "==> Creating virtualenv (.venv) with: $PY"
"$PY" -m venv .venv

echo "==> Upgrading pip"
./.venv/bin/python -m pip install --upgrade pip
echo "==> Installing requirements"
./.venv/bin/python -m pip install -r requirements.txt

echo
echo "Done. The desktop app will use this .venv automatically."
echo "Run the service standalone with:  ./.venv/bin/python -m uvicorn app.main:app --port 8756"
