# Eve Industrialist installer for Windows (Docker Desktop).
#
#   irm https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/install.ps1 | iex
#
# Asks a few questions, writes .env with generated secrets, pulls the image and
# starts the stack. Re-running never overwrites an existing .env.
# Set PORT to change the port (default 80, or 8080 with PROXY=none) for
# DOMAIN=localhost or PROXY=none, e.g. $env:PORT='8080'; $env:DOMAIN='localhost'.
# Provided as is, without warranty. See LICENSE (AGPL-3.0).
$ErrorActionPreference = 'Stop'

$RawUrl = if ($env:EVE_RAW_URL) { $env:EVE_RAW_URL } else { 'https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy' }
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { Join-Path (Get-Location) 'eve-industrialist' }

function New-Secret([int]$Length) {
    $bytes = New-Object byte[] 64
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, $Length)
}
function Read-Required([string]$Prompt, [string]$Default = '', [switch]$Secret) {
    while ($true) {
        try {
            if ($Secret) {
                $s = Read-Host $Prompt -AsSecureString
                $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
            } else {
                $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
                $v = Read-Host $label
            }
        } catch {
            # No console to ask on (non-interactive session): use the default or ask for the variable.
            if ($Default) { return $Default }
            throw "$Prompt is required (set it in the environment when running non-interactively)."
        }
        if (-not $v) { $v = $Default }
        if ($v) { return $v }
        Write-Host 'A value is required.'
    }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed. Install Docker Desktop first.' }
docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose v2 is required (the 'docker compose' command)." }

Write-Host "Installing into $InstallDir"
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir 'themes') | Out-Null
Set-Location $InstallDir

$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $null }
foreach ($f in 'docker-compose.yml', 'docker-compose.no-proxy.yml', 'Caddyfile', '.env.example', 'update.sh', 'update.ps1', 'backup.sh', 'restore.sh') {
    if ($scriptDir -and (Test-Path (Join-Path $scriptDir $f))) { Copy-Item (Join-Path $scriptDir $f) $f -Force }
    else { Invoke-WebRequest "$RawUrl/$f" -OutFile $f }
}

if (Test-Path .env) {
    Write-Host '.env already exists, keeping it.'
} else {
    # MySQL sets its passwords only when it first creates its volume, so a new .env
    # (with new passwords) cannot work against data left by an earlier install.
    $project = if ($env:COMPOSE_PROJECT_NAME) { $env:COMPOSE_PROJECT_NAME } else { 'eve-industry' }
    $dbVolume = "${project}_mysql-data"
    if (docker volume ls -q --filter "name=^$dbVolume$") {
        throw ("There is no .env in $InstallDir, but the database volume $dbVolume from an earlier install still exists.`n" +
            "A new .env would have new passwords that this database rejects. Either:`n" +
            "  - keep that data: put the earlier .env back in $InstallDir and run this installer again, or`n" +
            "  - delete it (all data from the earlier install is lost): run 'docker compose down -v' in $InstallDir, then run this installer again.")
    }

    $domain =if ($env:DOMAIN) { $env:DOMAIN } else { Read-Required "Public domain name (or 'localhost' to try it locally)" 'localhost' }
    $proxy = if ($env:PROXY) { $env:PROXY } else { 'caddy' }

    # The port people connect to. Selectable for localhost and when you bring your own
    # proxy (PROXY=none, where it is the port web listens on at 127.0.0.1). A public
    # domain with the bundled Caddy needs 80 and 443 for automatic HTTPS.
    if ($domain -eq 'localhost' -or $proxy -eq 'none') {
        $defaultPort = if ($proxy -eq 'none') { '8080' } else { '80' }
        $port = if ($env:PORT) { $env:PORT } else { Read-Required 'HTTP port to listen on' $defaultPort }
    } else {
        $port = if ($env:PORT) { $env:PORT } else { '80' }
        if ($port -ne '80') { throw 'Automatic HTTPS needs ports 80 and 443. Use DOMAIN=localhost or PROXY=none to choose another port.' }
    }
    if ($port -notmatch '^\d+$' -or [int]$port -lt 1 -or [int]$port -gt 65535) { throw 'PORT must be a number between 1 and 65535.' }

    if ($domain -eq 'localhost') {
        if ($port -eq '80') { $appUrl = 'http://localhost'; $site = 'http://localhost' } else { $appUrl = "http://localhost:$port"; $site = "http://localhost:$port" }
    } else { $appUrl = "https://$domain"; $site = $domain }
    Write-Host 'Create an application at https://developers.eveonline.com'
    Write-Host "  Callback URL: $appUrl/auth/eve/callback"
    Write-Host '  Scopes: see docs/self-hosting/eve-sso.md (enable every scope listed there)'
    $clientId = if ($env:EVE_CLIENT_ID) { $env:EVE_CLIENT_ID } else { Read-Required 'EVE client ID' }
    $clientSecret = if ($env:EVE_CLIENT_SECRET) { $env:EVE_CLIENT_SECRET } else { Read-Required 'EVE client secret' -Secret }
    $contact = if ($env:ESI_CONTACT) { $env:ESI_CONTACT } else { Read-Required 'Contact email for CCP (sent in the ESI user agent)' }
    $adminEmail = if ($env:ADMIN_EMAIL) { $env:ADMIN_EMAIL } else { Read-Required 'Admin email address' $contact }

    $key = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($key)
    $lines = @(
        'APP_NAME="Eve Industrialist"',
        "APP_URL=$appUrl",
        "SITE_ADDRESS=$site",
        "APP_KEY=base64:$([Convert]::ToBase64String($key))",
        "EVE_VERSION=$(if ($env:EVE_VERSION) { $env:EVE_VERSION } else { 'latest' })",
        "EVE_CLIENT_ID=$clientId",
        "EVE_CLIENT_SECRET=$clientSecret",
        "EVE_REDIRECT_URI=$appUrl/auth/eve/callback",
        "ESI_USER_AGENT=`"EveIndustrialist/2.0 ($contact; +$appUrl)`"",
        'ESI_ENCRYPT_TOKENS=true',
        'SUPER_ADMIN_NAME="Super Admin"',
        "SUPER_ADMIN_EMAIL=$adminEmail",
        'SUPER_ADMIN_PASSWORD=',
        'DB_DATABASE=eve_industrialist',
        'DB_USERNAME=eve_industrialist',
        "DB_PASSWORD=$(New-Secret 32)",
        "DB_ROOT_PASSWORD=$(New-Secret 32)",
        'LOG_CHANNEL=daily', 'LOG_DAILY_DAYS=5', 'LOG_LEVEL=warning'
    )
    if ($proxy -eq 'none') { $lines += 'COMPOSE_FILE=docker-compose.yml;docker-compose.no-proxy.yml'; $lines += 'COMPOSE_PATH_SEPARATOR=;'; $lines += "WEB_PORT=$port" }
    else { $lines += "HTTP_PORT=$port" }
    [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines)
    Write-Host 'Wrote .env (back up APP_KEY: losing it makes encrypted data unreadable).'
}

if ($env:EVE_NO_START) { Write-Host 'EVE_NO_START is set: configuration written, nothing started.'; return }

docker compose pull
docker compose up -d

Write-Host 'Waiting for the app to become healthy (first start can take a few minutes)'
$state = ''
for ($i = 0; $i -lt 90; $i++) {
    $state = (docker compose ps web --format '{{.Health}}') 2>$null
    if ($state -eq 'healthy') { break }
    Start-Sleep -Seconds 5
}
if ($state -ne 'healthy') { throw 'The web container did not become healthy. Check: docker compose logs web migrate' }

$password = ''
for ($i = 0; $i -lt 60; $i++) {
    $log = (docker compose logs install 2>$null) -join "`n"
    if ($log -match 'Generated admin password[^:]*: (\S+)') { $password = $Matches[1]; break }
    if ($log -match 'Super admin already exists') { break }
    Start-Sleep -Seconds 3
}

$appUrlNow = ((Get-Content .env | Where-Object { $_ -like 'APP_URL=*' }) -replace '^APP_URL=', '')
Write-Host ''
Write-Host "App:   $appUrlNow"
Write-Host "Admin: $appUrlNow/admin/login"
if ($password) { Write-Host "Password (shown once, change it after signing in): $password" }
Write-Host 'Game data (items, prices) imports in the background and can take a while.'
Write-Host "Progress: Invoke-RestMethod $appUrlNow/api/v1/health"
Write-Host 'Update later with .\update.ps1'
