@echo off
setlocal

set "BACKEND_DIR=%~dp0backend"

echo ============================================
echo  opeSchedule - Starting...
echo ============================================

python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.11+
    pause
    exit /b 1
)

echo [1/3] Installing dependencies...
pip install -r "%BACKEND_DIR%\requirements.txt" -q
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

echo [2/3] Running DB migration...
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

echo [3/3] Starting server...
echo.
echo  Frontend : http://localhost:8000
echo  Swagger  : http://localhost:8000/api/docs
echo.
echo  Press Ctrl+C to stop.
echo ============================================

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

endlocal
pause
