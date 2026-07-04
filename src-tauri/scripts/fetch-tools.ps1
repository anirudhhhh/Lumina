# Download the native tools Lumina bundles so the installed app needs NO
# external software: JADX (decompiler) + a Temurin JRE to run it. They are
# staged into src-tauri/resources/tools/ and packaged by Tauri (see the
# "resources" key in tauri.conf.json). Run before `npm run app:build`.
#
# Windows edition. Idempotent — skips downloads already present.

$ErrorActionPreference = "Stop"
$JADX_VERSION = "1.5.1"
$JRE_FEATURE  = "21"

$here  = $PSScriptRoot
$tools = Join-Path (Split-Path -Parent $here) "resources\tools"
New-Item -ItemType Directory -Force -Path $tools | Out-Null
$tmp = Join-Path $env:TEMP "lumina-tools"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# --- JADX ---
$jadxDir = Join-Path $tools "jadx"
if (-not (Test-Path (Join-Path $jadxDir "bin\jadx.bat"))) {
    Write-Host "==> Downloading JADX $JADX_VERSION" -ForegroundColor Cyan
    $zip = Join-Path $tmp "jadx.zip"
    Invoke-WebRequest -Uri "https://github.com/skylot/jadx/releases/download/v$JADX_VERSION/jadx-$JADX_VERSION.zip" -OutFile $zip
    if (Test-Path $jadxDir) { Remove-Item -Recurse -Force $jadxDir }
    Expand-Archive -Path $zip -DestinationPath $jadxDir -Force
} else {
    Write-Host "==> JADX already present, skipping" -ForegroundColor DarkGray
}

# --- JRE (Adoptium Temurin) ---
$jreDir = Join-Path $tools "jre"
if (-not (Test-Path (Join-Path $jreDir "bin\java.exe"))) {
    Write-Host "==> Downloading Temurin JRE $JRE_FEATURE (windows x64)" -ForegroundColor Cyan
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "aarch64" } else { "x64" }
    $zip = Join-Path $tmp "jre.zip"
    Invoke-WebRequest -Uri "https://api.adoptium.net/v3/binary/latest/$JRE_FEATURE/ga/windows/$arch/jre/hotspot/normal/eclipse?project=jdk" -OutFile $zip
    $extract = Join-Path $tmp "jre-extract"
    if (Test-Path $extract) { Remove-Item -Recurse -Force $extract }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    $inner = Get-ChildItem -Directory $extract | Select-Object -First 1
    if (Test-Path $jreDir) { Remove-Item -Recurse -Force $jreDir }
    Move-Item $inner.FullName $jreDir
} else {
    Write-Host "==> JRE already present, skipping" -ForegroundColor DarkGray
}

Write-Host "`nTools staged in $tools" -ForegroundColor Green
