# Eve Industrialist installer for Windows (Docker Desktop).
#
#   irm https://raw.githubusercontent.com/Eve-Industry/eve-industry/main/deploy/install.ps1 | iex
#
# Asks a few questions, writes .env with generated secrets, pulls the image and
# starts the stack. Re-running never overwrites an existing .env.
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
        if ($Secret) {
            $s = Read-Host $Prompt -AsSecureString
            $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
        } else {
            $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
            $v = Read-Host $label
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
foreach ($f in 'docker-compose.yml', 'docker-compose.no-proxy.yml', 'Caddyfile', '.env.example', 'update.sh', 'backup.sh', 'restore.sh') {
    if ($scriptDir -and (Test-Path (Join-Path $scriptDir $f))) { Copy-Item (Join-Path $scriptDir $f) $f -Force }
    else { Invoke-WebRequest "$RawUrl/$f" -OutFile $f }
}

if (Test-Path .env) {
    Write-Host '.env already exists, keeping it.'
} else {
    $domain = if ($env:DOMAIN) { $env:DOMAIN } else { Read-Required "Public domain name (or 'localhost' to try it locally)" 'localhost' }
    if ($domain -eq 'localhost') { $appUrl = 'http://localhost'; $site = 'http://localhost' } else { $appUrl = "https://$domain"; $site = $domain }
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
    if ($env:PROXY -eq 'none') { $lines += 'COMPOSE_FILE=docker-compose.yml;docker-compose.no-proxy.yml'; $lines += 'COMPOSE_PATH_SEPARATOR=;'; $lines += 'WEB_PORT=8080' }
    [IO.File]::WriteAllLines((Join-Path (Get-Location) '.env'), $lines)
    Write-Host 'Wrote .env (back up APP_KEY: losing it makes encrypted data unreadable).'
}

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
