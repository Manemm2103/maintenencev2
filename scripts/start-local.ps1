param(
  [switch]$Build,
  [switch]$Logs
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Update secrets before production use."
}

$composeArgs = @("compose", "up", "-d")
if ($Build) {
  $composeArgs += "--build"
}

docker @composeArgs

Write-Host ""
Write-Host "API: http://localhost:3000/api/health"
Write-Host "Demo login: login@login.de / 123456"

if ($Logs) {
  docker compose logs -f api
}
