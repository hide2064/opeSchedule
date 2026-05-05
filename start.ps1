#Requires -Version 5.1
<#
.SYNOPSIS
    opeSchedule を Docker で起動する
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================"
Write-Host " opeSchedule - Starting with Docker..."
Write-Host "============================================"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Docker not found. Please install Docker Desktop."
    exit 1
}

Set-Location $Root

Write-Host ""
Write-Host "  Frontend : http://localhost:8000"
Write-Host "  Swagger  : http://localhost:8000/api/docs"
Write-Host ""
Write-Host "  Press Ctrl+C to stop."
Write-Host "  After stopping, run: docker compose down"
Write-Host "============================================"
Write-Host ""

docker compose up --build
