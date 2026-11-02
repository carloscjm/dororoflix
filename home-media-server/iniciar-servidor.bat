@echo off
chcp 65001 >nul
title Home Media Server
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependências...
  call npm install
)

if not exist .env (
  echo Criando .env a partir do .env.example...
  copy .env.example .env >nul
)

echo Iniciando o servidor de mídia. Para parar, feche esta janela ou execute parar-servidor.bat.
echo.
call npm run dev

echo.
echo O servidor foi encerrado.
pause
