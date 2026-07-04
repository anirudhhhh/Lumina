# Freeze the Lumina Python service into a self-contained executable that the
# Tauri app bundles as a sidecar (externalBin). End users install no Python.
# Output: src-tauri/binaries/lumina-service-<rust-target-triple>[.exe]
#
# Run this on a Windows machine before `npm run app:build`. macOS/Linux builds
# use scripts/build-service.sh (Tauri cannot cross-compile — build per OS).

$ErrorActionPreference = "Stop"
$svc = Split-Path -Parent $PSScriptRoot          # python-service/
$root = Split-Path -Parent $svc                  # repo root
$venvPy = Join-Path $svc ".venv\Scripts\python.exe"
Set-Location $svc

if (-not (Test-Path $venvPy)) {
    Write-Host "==> No .venv found — running setup first" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "setup.ps1")
}

Write-Host "==> Ensuring PyInstaller is installed" -ForegroundColor Cyan
& $venvPy -m pip install --upgrade pyinstaller

# Resolve the Rust target triple Tauri expects in the sidecar filename.
$triple = (& rustc -vV | Select-String "host:").ToString().Split(" ")[1]
Write-Host "==> Target triple: $triple" -ForegroundColor Cyan

$work = Join-Path $svc "build\pyi"
$dist = Join-Path $svc "build\dist"
Write-Host "==> Running PyInstaller (this bundles Androguard + all deps)" -ForegroundColor Cyan
& $venvPy -m PyInstaller --noconfirm --clean --onefile --name lumina-service `
    --collect-all androguard `
    --collect-all uvicorn `
    --collect-all pydantic `
    --collect-all pydantic_core `
    --collect-all openai `
    --collect-all httpx `
    --collect-all certifi `
    --collect-submodules app `
    --hidden-import app.main `
    --distpath $dist --workpath $work --specpath $work `
    run_service.py

$outDir = Join-Path $root "src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$target = Join-Path $outDir "lumina-service-$triple.exe"
Copy-Item (Join-Path $dist "lumina-service.exe") $target -Force

Write-Host "`nDone → $target" -ForegroundColor Green
