# Instala e abre o HomeFlix na TV Samsung (Developer Mode ligado, mesma rede).
#
# Uso:  npm run install:tv -- -TvIp 192.168.15.50
param(
    [Parameter(Mandatory = $true)][string]$TvIp,
    [string]$Package = 'release\HomeFlix.wgt',
    [string]$TizenHome = $env:TIZEN_STUDIO_HOME
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$homes = @()
if ($TizenHome) { $homes += $TizenHome }
$homes += 'C:\tizen-studio'
$homes += (Join-Path $env:USERPROFILE 'tizen-studio')
$studio = $homes | Where-Object { Test-Path (Join-Path $_ 'tools\sdb.exe') } | Select-Object -First 1
if (-not $studio) {
    Write-Host 'Tizen Studio não encontrado (tools\sdb.exe). Defina TIZEN_STUDIO_HOME.' -ForegroundColor Red
    exit 1
}
$sdb = Join-Path $studio 'tools\sdb.exe'
$tizen = Join-Path $studio 'tools\ide\bin\tizen.bat'

if (-not (Test-Path $Package)) {
    Write-Host "Pacote '$Package' não existe. Rode antes: npm run package" -ForegroundColor Red
    exit 1
}

$serial = "${TvIp}:26101"
Write-Host "==> Conectando à TV $serial" -ForegroundColor Cyan
& $sdb connect $serial
& $sdb devices

Write-Host '==> Instalando' -ForegroundColor Cyan
& $tizen install -n (Resolve-Path $Package) -s $serial
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Falha na instalação. Verifique o Developer Mode (IP do PC cadastrado) e se o certificado inclui o DUID da TV.' -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host '==> Abrindo o HomeFlix' -ForegroundColor Cyan
& $tizen run -p HmFlxApp01.HomeFlix -s $serial
