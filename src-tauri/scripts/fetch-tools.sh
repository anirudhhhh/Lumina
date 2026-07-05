#!/usr/bin/env bash
# Download the native tools Lumina bundles so the installed app needs NO
# external software: JADX (decompiler) + a Temurin JRE to run it. They are
# staged into src-tauri/resources/tools/ and packaged by Tauri (see the
# "resources" key in tauri.conf.json). Run before `npm run app:build`.
#
# macOS / Linux edition. Idempotent — skips downloads already present.
set -euo pipefail

JADX_VERSION="1.5.1"
JRE_FEATURE="21"

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$(cd "$HERE/.." && pwd)/resources/tools"
mkdir -p "$TOOLS"
TMP="$(mktemp -d)"

# OS/arch for the Adoptium API.
case "$(uname -s)" in
  Darwin) OS="mac" ;;
  Linux)  OS="linux" ;;
  *) echo "Unsupported OS: $(uname -s)"; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH="aarch64" ;;
  *) ARCH="x64" ;;
esac

# --- JADX ---
if [ ! -f "$TOOLS/jadx/bin/jadx" ]; then
  echo "==> Downloading JADX $JADX_VERSION"
  curl -fsSL "https://github.com/skylot/jadx/releases/download/v$JADX_VERSION/jadx-$JADX_VERSION.zip" -o "$TMP/jadx.zip"
  rm -rf "$TOOLS/jadx"; mkdir -p "$TOOLS/jadx"
  unzip -q "$TMP/jadx.zip" -d "$TOOLS/jadx"
  chmod +x "$TOOLS/jadx/bin/jadx" || true
else
  echo "==> JADX already present, skipping"
fi

# --- JRE (Adoptium Temurin) ---
JAVA_BIN="$TOOLS/jre/bin/java"
[ "$OS" = "mac" ] && JAVA_BIN="$TOOLS/jre/Contents/Home/bin/java"
if [ ! -x "$JAVA_BIN" ]; then
  echo "==> Downloading Temurin JRE $JRE_FEATURE ($OS $ARCH)"
  curl -fsSL "https://api.adoptium.net/v3/binary/latest/$JRE_FEATURE/ga/$OS/$ARCH/jre/hotspot/normal/eclipse?project=jdk" -o "$TMP/jre.tar.gz"
  rm -rf "$TMP/jre"; mkdir -p "$TMP/jre"
  tar -xzf "$TMP/jre.tar.gz" -C "$TMP/jre"
  INNER="$(find "$TMP/jre" -maxdepth 1 -mindepth 1 -type d | head -n1)"
  rm -rf "$TOOLS/jre"
  mv "$INNER" "$TOOLS/jre"
else
  echo "==> JRE already present, skipping"
fi

# --- Android platform-tools (adb) for dynamic analysis ---
if [ ! -x "$TOOLS/platform-tools/adb" ]; then
  echo "==> Downloading Android platform-tools (adb) ($OS)"
  PT_OS="linux"; [ "$OS" = "mac" ] && PT_OS="darwin"
  curl -fsSL "https://dl.google.com/android/repository/platform-tools-latest-$PT_OS.zip" -o "$TMP/platform-tools.zip"
  rm -rf "$TOOLS/platform-tools"
  unzip -q "$TMP/platform-tools.zip" -d "$TOOLS"   # zip already contains platform-tools/
  chmod +x "$TOOLS/platform-tools/adb" || true
else
  echo "==> platform-tools already present, skipping"
fi

rm -rf "$TMP"
echo
echo "Tools staged in $TOOLS"
