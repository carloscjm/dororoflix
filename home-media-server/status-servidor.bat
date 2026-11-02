@echo off
title Status do Home Media Server
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status.ps1" -Porta 8080
pause
