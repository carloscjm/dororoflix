@echo off
chcp 65001 >nul
set PORTA=8080

echo Parando o servidor de mídia (porta %PORTA%)...

rem Fecha a janela aberta pelo iniciar-servidor.bat (e os processos filhos).
taskkill /FI "WINDOWTITLE eq Home Media Server*" /T /F >nul 2>&1

rem Encerra qualquer processo node.exe que ainda esteja escutando na porta,
rem incluindo o processo pai do "tsx watch", para ele não reiniciar o servidor.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$conns = Get-NetTCPConnection -LocalPort %PORTA% -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0 | Select-Object -Unique OwningProcess;" ^
  "foreach ($c in $conns) {" ^
  "  $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $c.OwningProcess);" ^
  "  if ($p -and $p.Name -eq 'node.exe') {" ^
  "    $pai = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $p.ParentProcessId);" ^
  "    if ($pai -and $pai.Name -eq 'node.exe') { taskkill /PID $pai.ProcessId /T /F | Out-Null }" ^
  "    taskkill /PID $p.ProcessId /T /F 2>$null | Out-Null" ^
  "  }" ^
  "}"

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORTA% -ErrorAction SilentlyContinue | Where-Object OwningProcess -ne 0) { Write-Host 'Ainda há algo usando a porta %PORTA%.' } else { Write-Host 'Servidor parado.' }"

timeout /t 3 >nul
