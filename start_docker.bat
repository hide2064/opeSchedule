@echo off
setlocal

set "REPO_ROOT=%~dp0"

echo ============================================
echo  opeSchedule - Starting with Docker...
echo ============================================

docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker not found. Please install Docker Desktop.
    pause
    exit /b 1
)

cd /d "%REPO_ROOT%"

echo Starting Docker containers...
echo  (First run may take a few minutes to build the image)
echo.
echo  Frontend : http://localhost:8000
echo  Swagger  : http://localhost:8000/api/docs
echo.
echo  Press Ctrl+C to stop, then run: docker compose down
echo ============================================

docker compose up --build

endlocal
pause
