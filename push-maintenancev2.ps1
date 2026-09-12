$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/Manemm2103/maintenencev2.git"
$Branch = "main"
$CommitMessage = "Initial DR HOME maintenance backend"
$ProjectRoot = $PSScriptRoot
$SafeDirectory = ($ProjectRoot -replace "\\", "/")

Set-Location $ProjectRoot

Write-Host "DR HOME Maintenance Backend -> GitHub Push" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Repo:    $RepoUrl"
Write-Host ""

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git wurde nicht gefunden. Bitte Git installieren oder Git in PATH aufnehmen."
}

function Invoke-Git {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
  )

  & git -c "safe.directory=$SafeDirectory" @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
}

if (-not (Test-Path ".git")) {
  Write-Host "Initialisiere lokales Git Repository..."
  Invoke-Git init
}

$currentBranch = Invoke-Git branch --show-current
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
  Invoke-Git checkout -b $Branch
} elseif ($currentBranch -ne $Branch) {
  Invoke-Git branch -M $Branch
}

$originUrl = ""
$remotes = Invoke-Git remote
if ($remotes -contains "origin") {
  $originUrl = Invoke-Git remote get-url origin
  if ($originUrl -ne $RepoUrl) {
    Write-Host "Setze origin neu: $RepoUrl"
    Invoke-Git remote set-url origin $RepoUrl
  }
} else {
  Write-Host "Fuege origin hinzu: $RepoUrl"
  Invoke-Git remote add origin $RepoUrl
}

Write-Host "Fuege Dateien hinzu..."
Invoke-Git add .

$status = Invoke-Git status --porcelain
if ($status) {
  Write-Host "Erstelle Commit..."
  Invoke-Git commit -m $CommitMessage
} else {
  Write-Host "Keine neuen Aenderungen zum Committen."
}

Write-Host "Pruefe, ob das Remote Repository bereits Commits hat..."
$remoteHasBranch = $false
& git -c "safe.directory=$SafeDirectory" ls-remote --exit-code --heads origin $Branch | Out-Null
if ($LASTEXITCODE -eq 0) {
  $remoteHasBranch = $true
} elseif ($LASTEXITCODE -eq 2) {
  $remoteHasBranch = $false
} else {
  throw "Konnte das Remote Repository nicht lesen. Bitte pruefe Repo-URL und GitHub-Zugriff."
}

if ($remoteHasBranch) {
  Write-Host "Remote Branch existiert. Versuche Pull --rebase vor dem Push..."
  try {
    Invoke-Git pull --rebase origin $Branch
  } catch {
    Write-Host ""
    Write-Host "Pull --rebase konnte nicht automatisch abgeschlossen werden." -ForegroundColor Yellow
    Write-Host "Wenn Git Konflikte meldet, bitte Konflikte loesen und danach ausfuehren:"
    Write-Host "  git rebase --continue"
    Write-Host "  git push -u origin $Branch"
    throw
  }
}

Write-Host "Pushe nach GitHub..."
Invoke-Git push -u origin $Branch

Write-Host ""
Write-Host "Fertig. Repository wurde nach GitHub gepusht:" -ForegroundColor Green
Write-Host $RepoUrl
