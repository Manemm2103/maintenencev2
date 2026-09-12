param(
  [string]$RepoUrl = "https://github.com/Manemm2103/maintenencev2.git",

  [string]$Branch = "main",
  [string]$CommitMessage = "Initial DR HOME maintenance backend"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SafeDirectory = ($ProjectRoot.Path -replace "\\", "/")
Set-Location $ProjectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "Git is not installed or not available in PATH."
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
  Invoke-Git init
}

$currentBranch = Invoke-Git branch --show-current
if ([string]::IsNullOrWhiteSpace($currentBranch)) {
  Invoke-Git checkout -b $Branch
} elseif ($currentBranch -ne $Branch) {
  Invoke-Git branch -M $Branch
}

$remotes = Invoke-Git remote
if ($remotes -contains "origin") {
  Invoke-Git remote set-url origin $RepoUrl
} else {
  Invoke-Git remote add origin $RepoUrl
}

Invoke-Git add .

$status = Invoke-Git status --porcelain
if ($status) {
  Invoke-Git commit -m $CommitMessage
} else {
  Write-Host "No changes to commit."
}

Invoke-Git push -u origin $Branch
