# Lumina Python service — one-shot venv setup (Windows / PowerShell).
# Creates python-service/.venv and installs pinned-range requirements into it.
# The Tauri core auto-detects this .venv and uses it to spawn the service.

$ErrorActionPreference = "Stop"
$svc = Split-Path -Parent $PSScriptRoot   # python-service/
Set-Location $svc

# Pick a Python launcher (prefer 3.12, then 3.11/3.10, then whatever's on PATH).
$py = $null
foreach ($c in @("py -3.12", "py -3.11", "py -3.10", "python")) {
    $parts = $c.Split(" ")
    if (Get-Command $parts[0] -ErrorAction SilentlyContinue) { $py = $c; break }
}
if (-not $py) { throw "No Python interpreter found. Install Python 3.10-3.12." }

Write-Host "==> Creating virtualenv (.venv) with: $py" -ForegroundColor Cyan
Invoke-Expression "$py -m venv .venv"

$venvPy = Join-Path $svc ".venv\Scripts\python.exe"
Write-Host "==> Upgrading pip" -ForegroundColor Cyan
& $venvPy -m pip install --upgrade pip
Write-Host "==> Installing requirements" -ForegroundColor Cyan
& $venvPy -m pip install -r requirements.txt

Write-Host "`nDone. The desktop app will use this .venv automatically." -ForegroundColor Green
Write-Host "Run the service standalone with:  .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8756"
