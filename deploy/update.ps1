# Update every part of an Eve Industrialist install on Windows (Docker Desktop): the stack
# files (compose files, Caddyfile, .env.example, these scripts) and all images, then restart
# and wait for health. Migrations run automatically in the one-off migrate service.
# .env is never replaced.
#
#   .\update.ps1                    update to the newest files and images for EVE_VERSION
#   .\update.ps1 -Version 1.2.3     switch EVE_VERSION in .env first, then update
#   .\update.ps1 -SkipFiles         only pull images and restart (keep hand-edited files)
#
# Blocked by the execution policy? powershell -ExecutionPolicy Bypass -File .\update.ps1
# Also works piped from inside the install folder:
#   irm https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/update.ps1 | iex
# The previous files are kept in .previous\. EVE_RAW_URL overrides where files come from.
# Back up first (./backup.sh from WSL or Git Bash).
#
# Provided as is, without warranty. See LICENSE (AGPL-3.0).
param(
    [string]$Version = '',
    [switch]$SkipFiles
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Files = 'docker-compose.yml', 'docker-compose.no-proxy.yml', 'Caddyfile', '.env.example', 'update.sh', 'update.ps1', 'backup.sh', 'restore.sh'
$RepoRaw = 'https://raw.githubusercontent.com/Eve-Industry/eve-industry'

# Runs a docker command and returns its output (stderr included) without PowerShell turning
# stderr lines into terminating errors. Sets $LASTEXITCODE as usual.
function Invoke-Docker {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & docker @args 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $old }
}
function Get-EnvValue([string]$Name) {
    $line = Get-Content .env | Where-Object { $_ -like "$Name=*" } | Select-Object -Last 1
    if ($line) { ($line -replace "^$Name=", '') -replace '^"(.*)"$', '$1' } else { '' }
}
function Get-ProjectName {
    $out = Invoke-Docker compose config
    if ($LASTEXITCODE -ne 0) { return '' }
    $line = $out | Where-Object { $_ -match '^name: ' } | Select-Object -First 1
    if ($line) { $line -replace '^name: ', '' } else { '' }
}
function Add-EnvLine([string]$Line) {
    [IO.File]::AppendAllText((Join-Path (Get-Location) '.env'), "`n$Line`n")
}
function Get-Keys([string]$Path) {
    Get-Content $Path | Where-Object { $_ -match '^[A-Z][A-Z0-9_]*=' } | ForEach-Object { ($_ -split '=', 2)[0] } | Sort-Object -Unique
}

# Run from the script's folder; piped through iex there is no script file, so only accept
# INSTALL_DIR or the current directory when it looks like an install.
$dir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { (Get-Location).Path }
Set-Location $dir
if (-not (Test-Path .env)) { throw "No .env in $dir. Run this from your install folder, or install first (install.ps1)." }
if (-not ((Test-Path docker-compose.yml) -and (Select-String -Path docker-compose.yml -Pattern 'EVE_VERSION' -Quiet))) {
    throw "$dir does not look like an Eve Industrialist install (no matching docker-compose.yml)."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed. Install Docker Desktop first.' }
Invoke-Docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose v2 is required (the 'docker compose' command)." }

if ($Version) {
    $Version = $Version -replace '^v', ''
    if ($Version -notmatch '^[A-Za-z0-9._-]+$') { throw "Invalid version: $Version" }
    $envPath = Join-Path (Get-Location) '.env'
    $lines = [IO.File]::ReadAllLines($envPath)
    if ($lines -match '^EVE_VERSION=') {
        $lines = $lines | ForEach-Object { if ($_ -match '^EVE_VERSION=') { "EVE_VERSION=$Version" } else { $_ } }
        [IO.File]::WriteAllLines($envPath, [string[]]$lines)
    } else { Add-EnvLine "EVE_VERSION=$Version" }
    Write-Host "EVE_VERSION set to $Version"
}

if (-not $SkipFiles) {
    # Stack files match the pinned image (its release tag); the helper scripts always come
    # from main, so an older pin never downgrades this updater.
    $current = (Get-EnvValue 'EVE_VERSION') -replace '^v', ''
    $scriptSource = if ($env:EVE_RAW_URL) { $env:EVE_RAW_URL } else { "$RepoRaw/main/deploy" }
    $stackSource = if ($env:EVE_RAW_URL) { $env:EVE_RAW_URL }
                   elseif ($current -match '^\d+\.\d+\.\d+$') { "$RepoRaw/v$current/deploy" }
                   else { "$RepoRaw/main/deploy" }

    Write-Host "Downloading stack files from $stackSource"
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("eve-update-" + [Guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
        foreach ($f in $Files) {
            $src = if ($f -like '*.sh' -or $f -like '*.ps1') { $scriptSource } else { $stackSource }
            try { Invoke-WebRequest "$src/$f" -OutFile (Join-Path $tmp $f) -UseBasicParsing }
            catch { throw "Could not download $f from $src ($($_.Exception.Message)). Nothing was changed." }
        }

        $oldProject = Get-ProjectName

        if (Test-Path .previous) { Remove-Item -Recurse -Force .previous }
        New-Item -ItemType Directory -Force -Path .previous, themes | Out-Null
        foreach ($f in $Files) { if (Test-Path $f) { Copy-Item $f (Join-Path .previous $f) -Force } }
        # PowerShell has parsed this whole script already, so replacing update.ps1 is safe.
        foreach ($f in $Files) { Copy-Item (Join-Path $tmp $f) $f -Force }
    } finally {
        Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
    }

    $err = Invoke-Docker compose config -q
    if ($LASTEXITCODE -ne 0) {
        foreach ($f in $Files) {
            $prev = Join-Path .previous $f
            if (Test-Path $prev) { Copy-Item $prev $f -Force } else { Remove-Item $f -Force -ErrorAction SilentlyContinue }
        }
        $err | ForEach-Object { Write-Host $_ }
        throw 'The new compose file does not accept your .env (see above; usually a new REQUIRED setting from .env.example). The previous files were restored.'
    }

    # Older compose files took the project name from the folder. Keep that name, or the new
    # file would start a second, empty stack next to the running one.
    $newProject = Get-ProjectName
    if ($oldProject -and $oldProject -ne $newProject -and -not (Get-EnvValue 'COMPOSE_PROJECT_NAME')) {
        $containers = Invoke-Docker compose -p $oldProject ps -a -q
        if ($LASTEXITCODE -eq 0 -and ($containers | Where-Object { $_ })) {
            Add-EnvLine "COMPOSE_PROJECT_NAME=$oldProject"
            Write-Host "Kept the existing project name $oldProject (COMPOSE_PROJECT_NAME in .env)"
        }
    }

    $missing = Get-Keys .env.example | Where-Object { (Get-Keys .env) -notcontains $_ }
    if ($missing) {
        Write-Host 'Settings in .env.example that your .env does not set (optional unless marked REQUIRED there):'
        $missing | ForEach-Object { Write-Host "  $_" }
    }
    Write-Host 'Stack files updated (previous copies in .previous\).'
}

if (-not $env:EVE_SKIP_PULL) {
    Write-Host 'Pulling images'
    docker compose pull
    if ($LASTEXITCODE -ne 0) { throw 'docker compose pull failed.' }
}

Write-Host 'Restarting'
docker compose up -d --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed. Check: docker compose logs migrate' }
Invoke-Docker image prune -f | Out-Null

Write-Host 'Waiting for the app to become healthy'
$state = ''
for ($i = 0; $i -lt 90; $i++) {
    $state = (Invoke-Docker compose ps web --format '{{.Health}}') -join ''
    if ($state -eq 'healthy') { break }
    Start-Sleep -Seconds 5
}
if ($state -ne 'healthy') { throw 'The web container did not become healthy. Check: docker compose logs web migrate' }

Write-Host ''
Write-Host 'Update finished'
Write-Host "  App:     $(Get-EnvValue 'APP_URL')"
Write-Host "  Version: $(Get-EnvValue 'EVE_VERSION')"
Write-Host '  Status:  docker compose ps'
