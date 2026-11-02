# Empacota o HomeFlix como .wgt assinado usando o Tizen Studio CLI.
#
# Pré-requisitos (veja README.md, seção "Instalar na TV"):
#   1. Tizen Studio (com "TV Extensions" e "Samsung Certificate Extension") instalado.
#   2. Perfil de certificado Samsung criado no Certificate Manager, incluindo o DUID da TV.
#
# Uso:  npm run package                      (perfil padrão "HomeFlix")
#       npm run package -- -Profile MeuPerfil
param(
    [string]$Profile = 'HomeFlix',
    [string]$TizenHome = $env:TIZEN_STUDIO_HOME
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$candidates = @()
if ($TizenHome) { $candidates += (Join-Path $TizenHome 'tools\ide\bin\tizen.bat') }
$candidates += 'C:\tizen-studio\tools\ide\bin\tizen.bat'
$candidates += (Join-Path $env:USERPROFILE 'tizen-studio\tools\ide\bin\tizen.bat')
$tizen = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $tizen) {
    Write-Host 'Tizen Studio CLI (tizen.bat) não encontrado.' -ForegroundColor Red
    Write-Host 'Instale o Tizen Studio ou defina TIZEN_STUDIO_HOME com a pasta de instalação.'
    exit 1
}

Write-Host '==> Build do app' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> Empacotando e assinando com o perfil '$Profile'" -ForegroundColor Cyan
& $tizen package -t wgt -s $Profile -- (Join-Path $root 'dist')
if ($LASTEXITCODE -ne 0) {
    Write-Host "Falha ao empacotar. Confira se o perfil '$Profile' existe em Tools > Certificate Manager." -ForegroundColor Red
    exit $LASTEXITCODE
}

$wgt = Get-ChildItem -Path (Join-Path $root 'dist') -Filter '*.wgt' | Select-Object -First 1
if (-not $wgt) { Write-Host 'Pacote .wgt não foi gerado.' -ForegroundColor Red; exit 1 }

New-Item -ItemType Directory -Force -Path (Join-Path $root 'release') | Out-Null
$target = Join-Path $root 'release\HomeFlix.wgt'
Move-Item -Force -Path $wgt.FullName -Destination $target
Write-Host "Pacote pronto: $target" -ForegroundColor Green
