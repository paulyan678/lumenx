# Windows build script - PyInstaller packaging
# PowerShell version

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Assert-NativeSuccess {
    param([string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

Write-Host "======================================"
Write-Host "Starting Windows packaging process"
Write-Host "======================================"

# Build frontend first
Write-Host "0. Building frontend..."
if (-not (Test-Path "frontend")) {
    Write-Host "Error: frontend directory not found" -ForegroundColor Red
    exit 1
}

Push-Location frontend

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found" -ForegroundColor Red
    Pop-Location
    exit 1
}
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major === 20 && minor >= 9 ? 0 : 1)"
Assert-NativeSuccess "Node.js 20.9+ version check"

Write-Host "   Installing locked frontend dependencies..."
npm ci
Assert-NativeSuccess "npm ci"
npm run lint
Assert-NativeSuccess "frontend lint"
npm run typecheck
Assert-NativeSuccess "frontend typecheck"
npm run test:all
Assert-NativeSuccess "frontend tests"
npm run check:colors
Assert-NativeSuccess "frontend color-token check"
Write-Host "   Building frontend..."
npm run build
Assert-NativeSuccess "frontend build"
npm run check:export
Assert-NativeSuccess "frontend static-export contract"

Pop-Location

$frontendExport = Join-Path $PSScriptRoot "frontend\out"
$staticDir = Join-Path $PSScriptRoot "static"
$staticStaging = Join-Path $PSScriptRoot "static.building"
$staticBackup = Join-Path $PSScriptRoot "static.previous"
if (-not (Test-Path (Join-Path $frontendExport "index.html"))) {
    throw "Frontend export is missing frontend/out/index.html"
}

foreach ($path in @($staticStaging, $staticBackup)) {
    if (Test-Path $path) { Remove-Item -Recurse -Force $path }
}
Copy-Item -Path $frontendExport -Destination $staticStaging -Recurse -Force
if (Test-Path $staticDir) {
    Move-Item -Path $staticDir -Destination $staticBackup
}
try {
    Move-Item -Path $staticStaging -Destination $staticDir
    if (Test-Path $staticBackup) { Remove-Item -Recurse -Force $staticBackup }
} catch {
    if ((-not (Test-Path $staticDir)) -and (Test-Path $staticBackup)) {
        Move-Item -Path $staticBackup -Destination $staticDir
    }
    throw
}

Write-Host "   Frontend build complete, desktop static output: static/"
Write-Host ""

# Check Python environment
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Python not found, please install Python first" -ForegroundColor Red
    exit 1
}

# Check and create virtual environment
Write-Host "1. Checking Python virtual environment..."
if (-not (Test-Path ".venv")) {
    Write-Host "   .venv does not exist, creating virtual environment..."
    python -m venv .venv
    Write-Host "   Virtual environment created successfully"
} else {
    Write-Host "   .venv already exists"
}

# Activate the environment before installing or validating anything. Running
# the release checks with the system Python can pass even when the packaged
# environment is incomplete.
Write-Host "2. Activating virtual environment..."
& ".venv\Scripts\Activate.ps1"

Write-Host "3. Installing project dependencies..."
if (Test-Path "requirements.txt") {
    python -m pip install --upgrade "pip==26.1.2"
    Assert-NativeSuccess "pip install"
    python -m pip install -r requirements.txt
    Assert-NativeSuccess "dependency install"
    python -m pip check
    Assert-NativeSuccess "dependency compatibility check"
    Write-Host "   Dependencies installed successfully"
} else {
    throw "requirements.txt is required to build the Windows package"
}

if (-not (Test-Path "requirements-dev.txt")) {
    throw "requirements-dev.txt is required to validate a release build"
}
python -m pip install -r requirements-dev.txt
Assert-NativeSuccess "QA dependency install"

Write-Host "3.5. Validating backend and generated catalogs..."
python scripts/check_duplicate_filenames.py
Assert-NativeSuccess "duplicate filename check"
python scripts/validate_model_catalog.py
Assert-NativeSuccess "model catalog validation"
python -m compileall -q src tests scripts main.py
Assert-NativeSuccess "Python compilation"
$env:LUMENX_PRELOAD_DEMUCS = "0"
python -m pytest -q
Assert-NativeSuccess "backend tests"

# Check and install necessary packaging tools
Write-Host "4. Checking and installing packaging tools..."
python -m pip install "pyinstaller==6.21.0"
Assert-NativeSuccess "PyInstaller install"

# Clean previous packaging files
Write-Host "5. Cleaning old packaging files..."
if (Test-Path "build") { Remove-Item -Recurse -Force build }
if (Test-Path "dist") { Remove-Item -Recurse -Force dist }
if (Test-Path "dist_windows") { Remove-Item -Recurse -Force dist_windows }
foreach ($sourceRoot in @("src", "tests", "scripts")) {
    Get-ChildItem -Path $sourceRoot -Recurse -Directory -Filter "__pycache__" |
        Remove-Item -Recurse -Force
}

# Package with PyInstaller
Write-Host "6. Packaging with PyInstaller..."

# Prepare FFmpeg
Write-Host "5.5. Preparing FFmpeg..."
$packagingTemp = Join-Path ([IO.Path]::GetTempPath()) ("lumenx-package-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $packagingTemp | Out-Null
try {

$ffmpegCandidate = $env:LUMENX_FFMPEG_BINARY
if ([string]::IsNullOrWhiteSpace($ffmpegCandidate)) {
    $ffmpegCommand = Get-Command ffmpeg -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($ffmpegCommand) { $ffmpegCandidate = $ffmpegCommand.Source }
}
if ([string]::IsNullOrWhiteSpace($ffmpegCandidate) -or
    -not (Test-Path -LiteralPath $ffmpegCandidate -PathType Leaf)) {
    throw "A runnable FFmpeg was not found. Install FFmpeg or set LUMENX_FFMPEG_BINARY."
}

$ffmpegCandidate = (Resolve-Path -LiteralPath $ffmpegCandidate).Path
& $ffmpegCandidate -version | Out-Null
Assert-NativeSuccess "FFmpeg validation"
$packagedFfmpeg = Join-Path $packagingTemp "ffmpeg.exe"
Copy-Item -LiteralPath $ffmpegCandidate -Destination $packagedFfmpeg
Write-Host "   Validated and staged FFmpeg: $ffmpegCandidate"

# Check if icon file exists
$iconParam = ""
if (Test-Path "icon.ico") {
    $iconParam = "--icon=$(Join-Path $PSScriptRoot 'icon.ico')"
} else {
    Write-Host "Note: icon.ico not found, using default icon" -ForegroundColor Yellow
}

# Build PyInstaller command arguments
$pyinstallerArgs = @(
    "--clean",
    "--noconfirm",
    "--specpath", $packagingTemp,
    "--additional-hooks-dir", (Join-Path $PSScriptRoot ".pyinstaller-hooks"),
    "--onefile",
    "--name", "LumenX Studio",
    "--windowed",
    "--add-data", ((Join-Path $PSScriptRoot "static") + ";static"),
    "--add-data", ((Join-Path $PSScriptRoot "src") + ";src"),
    "--add-data", ((Join-Path $PSScriptRoot "config\model_catalog\generated\model_catalog.json") + ";config\model_catalog\generated"),
    "--add-binary", "$packagedFfmpeg;.",
    "--exclude-module", "uvloop",
    "--hidden-import=uvicorn.logging",
    "--hidden-import=uvicorn.loops",
    "--hidden-import=uvicorn.loops.auto",
    "--hidden-import=uvicorn.protocols",
    "--hidden-import=uvicorn.protocols.http",
    "--hidden-import=uvicorn.protocols.http.auto",
    "--hidden-import=uvicorn.protocols.websockets",
    "--hidden-import=uvicorn.protocols.websockets.auto",
    "--hidden-import=uvicorn.protocols.http.h11_impl",
    "--hidden-import=uvicorn.protocols.websockets.wsproto_impl",
    "--hidden-import=uvicorn.lifespan",
    "--hidden-import=uvicorn.lifespan.on",
    "--hidden-import=webview",
    "--hidden-import=winreg",
    "--hidden-import=urllib.request",
    "--hidden-import=tempfile",
    "--hidden-import=subprocess",
    "--hidden-import=starlette",
    "--hidden-import=starlette.staticfiles",
    "--hidden-import=fastapi",
    "--hidden-import=pydantic",
    "--hidden-import=openai",
    "--hidden-import=demucs",
    "--hidden-import=demucs.pretrained",
    "--hidden-import=demucs.separate",
    "--hidden-import=soundfile",
    "--hidden-import=yaml",
    "--hidden-import=dotenv",
    "--hidden-import=httptools",
    "--hidden-import=requests",
    "--hidden-import=multipart",
    "--collect-all", "uvicorn",
    "--collect-all", "fastapi",
    "--collect-all", "starlette",
    "--collect-all", "pydantic",
    "--collect-all", "demucs",
    (Join-Path $PSScriptRoot "main.py")
)

# If icon parameter exists, add to argument list
if ($iconParam) {
    $pyinstallerArgs = @(
        "--clean",
        "--noconfirm",
        "--specpath", $packagingTemp,
        "--additional-hooks-dir", (Join-Path $PSScriptRoot ".pyinstaller-hooks"),
        "--onefile",
        "--name", "LumenX Studio",
        "--windowed",
        $iconParam,
        "--add-data", ((Join-Path $PSScriptRoot "static") + ";static"),
        "--add-data", ((Join-Path $PSScriptRoot "src") + ";src"),
        "--add-data", ((Join-Path $PSScriptRoot "config\model_catalog\generated\model_catalog.json") + ";config\model_catalog\generated"),
        "--add-binary", "$packagedFfmpeg;.",
        "--exclude-module", "uvloop",
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.protocols.websockets",
        "--hidden-import=uvicorn.protocols.websockets.auto",
        "--hidden-import=uvicorn.protocols.http.h11_impl",
        "--hidden-import=uvicorn.protocols.websockets.wsproto_impl",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=webview",
        "--hidden-import=winreg",
        "--hidden-import=urllib.request",
        "--hidden-import=tempfile",
        "--hidden-import=subprocess",
        "--hidden-import=starlette",
        "--hidden-import=starlette.staticfiles",
        "--hidden-import=fastapi",
        "--hidden-import=pydantic",
        "--hidden-import=openai",
        "--hidden-import=demucs",
        "--hidden-import=demucs.pretrained",
        "--hidden-import=demucs.separate",
        "--hidden-import=soundfile",
        "--hidden-import=yaml",
        "--hidden-import=dotenv",
        "--hidden-import=httptools",
        "--hidden-import=requests",
        "--hidden-import=multipart",
        "--collect-all", "uvicorn",
        "--collect-all", "fastapi",
        "--collect-all", "starlette",
        "--collect-all", "pydantic",
        "--collect-all", "demucs",
        (Join-Path $PSScriptRoot "main.py")
    )
}

# Execute PyInstaller
pyinstaller @pyinstallerArgs
Assert-NativeSuccess "PyInstaller packaging"

# Copy packaging results to project root
Write-Host "7. Copying packaging results..."
if (-not (Test-Path "dist_windows")) {
    New-Item -ItemType Directory -Path dist_windows -Force | Out-Null
}
Copy-Item -Path dist\* -Destination dist_windows\ -Recurse -Force

Write-Host "======================================"
Write-Host "Packaging complete!" -ForegroundColor Green
Write-Host "Output directory: dist_windows\"
Write-Host "======================================"
} finally {
    if (Test-Path -LiteralPath $packagingTemp) {
        Remove-Item -LiteralPath $packagingTemp -Recurse -Force
    }
}
