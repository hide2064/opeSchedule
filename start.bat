@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%~dp0backend"
set "FRONTEND_DIR=%~dp0frontend"

echo ============================================
echo  opeSchedule - Starting...
echo ============================================

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

node --version >nul 2>&1
if errorlevel 1 (
    echo  Node.js not found. Installing via winget...
    winget --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] winget not found. Please install Node.js 18+ from https://nodejs.org/
        pause
        exit /b 1
    )
    winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    if errorlevel 1 (
        echo [ERROR] Node.js auto-install failed. Please install from https://nodejs.org/
        pause
        exit /b 1
    )
    rem Reload PATH from registry so node is usable in this session
    for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "SYS_PATH=%%B"
    for /f "skip=2 tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
    set "PATH=%SYS_PATH%;%USR_PATH%"
    node --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Node.js installed but PATH not refreshed. Please reopen this window and run start.bat again.
        pause
        exit /b 1
    )
    echo  Node.js installed successfully.
)

echo [1/4] Installing Python dependencies...
pip install -r "%BACKEND_DIR%\requirements.txt" -q
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

echo [2/4] Running DB migration...
cd /d "%BACKEND_DIR%"
alembic upgrade head >nul 2>&1
if errorlevel 1 (
    echo  Tables already exist. Stamping current revision...
    alembic stamp head
    if errorlevel 1 (
        echo [ERROR] alembic stamp head failed.
        pause
        exit /b 1
    )
    alembic upgrade head
    if errorlevel 1 (
        echo [ERROR] alembic upgrade head failed after stamp.
        pause
        exit /b 1
    )
)
echo  DB migration OK.

echo [3/4] Building frontend...
cd /d "%FRONTEND_DIR%"
if not exist "node_modules" (
    echo  Installing npm packages...
    npm install -q
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
npm run build
if errorlevel 1 (
    echo [ERROR] npm run build failed.
    pause
    exit /b 1
)
echo  Frontend build OK.

echo [4/4] Starting server...
cd /d "%BACKEND_DIR%"
echo.
echo  URL      : http://localhost:8000
echo  Swagger  : http://localhost:8000/api/docs
echo.
echo  Press Ctrl+C to stop.
echo ============================================

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

endlocal
pause
