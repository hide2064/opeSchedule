@echo off
setlocal

rem -- Ensure system directories are always in PATH --
set "PATH=%SystemRoot%\System32;%SystemRoot%;%SystemRoot%\System32\Wbem;%PATH%"

set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%~dp0backend"
set "FRONTEND_DIR=%~dp0frontend"

echo ============================================
echo  opeSchedule - Starting...
echo ============================================

rem -- Python check: read full user+system PATH from registry first --
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path') do set "SYS_PATH=%%B"
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USR_PATH=%%B"
set "PATH=%SYS_PATH%;%USR_PATH%;%PATH%"

py --version >nul 2>&1
if not errorlevel 1 goto python_ok
python --version >nul 2>&1
if not errorlevel 1 goto python_ok
echo [ERROR] Python not found. Please install Python 3.11+ from https://www.python.org/
pause
exit /b 1
:python_ok

rem -- Node.js check: auto-install via winget if missing --
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
py -m pip install -r "%BACKEND_DIR%\requirements-local.txt" -q 2>nul
if errorlevel 1 (
    python -m pip install -r "%BACKEND_DIR%\requirements-local.txt" -q
    if errorlevel 1 (
        echo [ERROR] pip install failed.
        pause
        exit /b 1
    )
)

echo [2/4] Running DB migration...
cd /d "%BACKEND_DIR%"
py -m alembic upgrade head >nul 2>&1
if errorlevel 1 (
    echo  Tables already exist. Stamping current revision...
    py -m alembic stamp head
    if errorlevel 1 (
        echo [ERROR] alembic stamp head failed.
        pause
        exit /b 1
    )
    py -m alembic upgrade head
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
    call npm install -q
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
call npm run build
if errorlevel 1 goto build_failed
echo  Frontend build OK.
goto build_done
:build_failed
echo [ERROR] npm run build failed.
pause
exit /b 1
:build_done

echo [4/4] Starting server...
cd /d "%BACKEND_DIR%"

rem -- Open port 8000 in Windows Firewall (silently, requires admin rights) --
netsh advfirewall firewall show rule name="opeSchedule port 8000" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="opeSchedule port 8000" ^
        dir=in action=allow protocol=TCP localport=8000 >nul 2>&1
    if not errorlevel 1 (
        echo  Firewall rule added for port 8000.
    ) else (
        echo  NOTE: Could not add firewall rule ^(run as Admin to allow LAN access^).
    )
)

rem -- Get local LAN IP --
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R "IPv4.*192\." 2^>nul') do (
    set "LAN_IP=%%I"
    goto :got_ip
)
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R "IPv4.*10\." 2^>nul') do (
    set "LAN_IP=%%I"
    goto :got_ip
)
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr "172.16. 172.17. 172.18. 172.19. 172.20. 172.21. 172.22. 172.23. 172.24. 172.25. 172.26. 172.27. 172.28. 172.29. 172.30. 172.31." 2^>nul') do (
    set "LAN_IP=%%I"
    goto :got_ip
)
set "LAN_IP= (not detected)"
:got_ip
set "LAN_IP=%LAN_IP: =%"

echo(
echo  [This PC]  http://localhost:8000
echo  [Other PC] http://%LAN_IP%:8000
echo(
echo  Swagger    : http://localhost:8000/api/docs
echo(
echo  Press Ctrl+C to stop.
echo ============================================

py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

endlocal
pause
