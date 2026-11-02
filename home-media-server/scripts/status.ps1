# Mostra o status do Home Media Server (usado por status-servidor.bat).
param([int]$Porta = 8080)

$ErrorActionPreference = 'SilentlyContinue'
Write-Host ''
Write-Host '  HOME MEDIA SERVER - STATUS' -ForegroundColor Cyan
Write-Host '  --------------------------' -ForegroundColor Cyan

$conexoes = Get-NetTCPConnection -LocalPort $Porta | Where-Object { $_.OwningProcess -ne 0 }
if (-not $conexoes) {
    Write-Host ''
    Write-Host "  Servidor PARADO (nada escutando na porta $Porta)." -ForegroundColor Red
    Write-Host '  Para ligar: iniciar-servidor.bat'
    exit 1
}

try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/health" -TimeoutSec 5
} catch {
    Write-Host ''
    Write-Host "  A porta $Porta está ocupada, mas o servidor não respondeu." -ForegroundColor Yellow
    Write-Host '  Tente parar-servidor.bat e depois iniciar-servidor.bat.'
    exit 1
}

$series = (Invoke-RestMethod -Uri "http://127.0.0.1:$Porta/api/series" -TimeoutSec 5).total
$ativo = [TimeSpan]::FromSeconds($health.uptimeSeconds)
$ativoTexto = if ($ativo.TotalHours -ge 1) { '{0}h{1:00}min' -f [int][Math]::Floor($ativo.TotalHours), $ativo.Minutes } else { '{0}min{1:00}s' -f $ativo.Minutes, $ativo.Seconds }
$scan = if ($health.catalog.scannedAt) { ([DateTime]$health.catalog.scannedAt).ToLocalTime().ToString('dd/MM/yyyy HH:mm') } else { '-' }

Write-Host ''
Write-Host '  Situação:      ' -NoNewline; Write-Host 'LIGADO' -ForegroundColor Green
Write-Host "  Ativo há:      $ativoTexto"
Write-Host "  Vídeos:        $($health.catalog.total)"
Write-Host "  Séries:        $series"
Write-Host "  Último scan:   $scan"

Write-Host ''
Write-Host '  Endereços:' -ForegroundColor Cyan
Write-Host "    Neste PC:    http://localhost:$Porta"
Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host "    Na rede:     http://$($_.IPAddress):$Porta   ($($_.InterfaceAlias))" }

$clientes = $conexoes |
    Where-Object { $_.RemoteAddress -notin @('0.0.0.0', '::', '127.0.0.1', '::1') } |
    Select-Object -ExpandProperty RemoteAddress -Unique
Write-Host ''
Write-Host '  Aparelhos conectados agora:' -ForegroundColor Cyan
if ($clientes) {
    foreach ($ip in $clientes) {
        $nome = if ($ip -eq '192.168.15.92') { '  (TV Samsung Q60C)' } else { '' }
        Write-Host "    $ip$nome"
    }
} else {
    Write-Host '    nenhum'
}
Write-Host ''
