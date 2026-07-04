#!/usr/bin/env bash
# Freeze the Lumina Python service into a self-contained executable that the
# Tauri app bundles as a sidecar (externalBin). End users install no Python.
# Output: src-tauri/binaries/lumina-service-<rust-target-triple>
#
# Run this on macOS/Linux before `npm run app:build` (Tauri cannot
# cross-compile — build the sidecar on each target OS).
set -euo pipefail

SVC="$(cd "$(dirname "$0")/.." && pwd)"   # python-service/
ROOT="$(cd "$SVC/.." && pwd)"             # repo root
VENV_PY="$SVC/.venv/bin/python3"
cd "$SVC"

if [ ! -x "$VENV_PY" ]; then
  echo "==> No .venv found — running setup first"
  bash "$(dirname "$0")/setup.sh"
fi

echo "==> Ensuring PyInstaller is installed"
"$VENV_PY" -m pip install --upgrade pyinstaller

# Rust target triple Tauri expects in the sidecar filename.
TRIPLE="$(rustc -vV | sed -n 's/host: //p')"
echo "==> Target triple: $TRIPLE"

WORK="$SVC/build/pyi"
DIST="$SVC/build/dist"
echo "==> Running PyInstaller (bundles Androguard + all deps)"
"$VENV_PY" -m PyInstaller --noconfirm --clean --onefile --name lumina-service \
  --collect-all androguard \
  --collect-all uvicorn \
  --collect-all pydantic \
  --collect-all pydantic_core \
  --collect-all openai \
  --collect-all httpx \
  --collect-all certifi \
  --collect-submodules app \
  --hidden-import app.main \
  --distpath "$DIST" --workpath "$WORK" --specpath "$WORK" \
  run_service.py

OUT_DIR="$ROOT/src-tauri/binaries"
mkdir -p "$OUT_DIR"
TARGET="$OUT_DIR/lumina-service-$TRIPLE"
cp "$DIST/lumina-service" "$TARGET"
chmod +x "$TARGET"

echo
echo "Done → $TARGET"
