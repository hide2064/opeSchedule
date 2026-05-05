#Requires -Version 5.1
<#
.SYNOPSIS
    opeSchedule を Docker でデバッグモード起動する（debugpy port 5678）
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================"
Write-Host " opeSchedule - DEBUG MODE (Docker)"
Write-Host " debugpy listening on port 5678"
Write-Host " VSCode でアタッチするまで起動を待機します..."
Write-Host "============================================"
Write-Host ""
Write-Host " [手順]"
Write-Host " 1. このウィンドウを開いたまま VSCode へ移動"
Write-Host " 2. F5 または「実行とデバッグ」から"
Write-Host "    `"FastAPI: Attach to Docker (port 5678)`" を選択"
Write-Host " 3. ブレークポイントを事前に設定しておくこと"
Write-Host ""
Write-Host "  Frontend : http://localhost:8000"
Write-Host "  Swagger  : http://localhost:8000/api/docs"
Write-Host "  debugpy  : localhost:5678"
Write-Host "============================================"
Write-Host ""

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Docker not found. Please install Docker Desktop."
    exit 1
}

Set-Location $Root

docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build
