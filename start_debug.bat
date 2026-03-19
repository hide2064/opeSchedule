@echo off
setlocal

set "BACKEND_DIR=%~dp0backend"

echo ============================================
echo  opeSchedule - DEBUG MODE
echo  debugpy listening on port 5678
echo  VSCode でアタッチするまで起動を待機します...
echo ============================================
echo.
echo  [手順]
echo  1. このウィンドウを開いたまま VSCode へ移動
echo  2. F5 または「実行とデバッグ」から
echo     "FastAPI: Attach to Remote (port 5678)" を選択
echo  3. ブレークポイントを事前に設定しておくこと
echo.
echo  Frontend : http://localhost:8000
echo  Swagger  : http://localhost:8000/api/docs
echo  debugpy  : localhost:5678
echo ============================================

cd /d "%BACKEND_DIR%"

python -m debugpy --listen 5678 --wait-for-client ^
  -m uvicorn app.main:app ^
  --reload ^
  --host 0.0.0.0 ^
  --port 8000 ^
  --log-level debug

endlocal
pause
