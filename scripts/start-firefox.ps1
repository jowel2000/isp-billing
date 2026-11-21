$ErrorActionPreference = 'Continue'

$root = Split-Path -Parent $PSScriptRoot
$apiUrl = 'http://localhost:3001/api/v1/health'
$webUrl = 'http://localhost:3000/login'
$firefox = 'C:\Program Files\Mozilla Firefox\firefox.exe'

function Test-Url($url) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

Write-Host 'ISP Billing - Firefox launcher' -ForegroundColor Cyan
Write-Host "Project: $root"

if (-not (Test-Url $apiUrl)) {
    Write-Host 'Starting API on port 3001...' -ForegroundColor Yellow
    Start-Process -FilePath 'node' `
        -ArgumentList 'dist/main.js' `
        -WorkingDirectory (Join-Path $root 'apps\api') `
        -WindowStyle Hidden
}

if (-not (Test-Url $webUrl)) {
    Write-Host 'Starting web on port 3000...' -ForegroundColor Yellow
    Start-Process -FilePath 'npm.cmd' `
        -ArgumentList 'run', 'dev', '-w', '@isp/web' `
        -WorkingDirectory $root `
        -WindowStyle Hidden
}

Write-Host 'Waiting for services (first compile can take up to 60s)...' -ForegroundColor Yellow

$apiOk = $false
$webOk = $false
for ($i = 0; $i -lt 120; $i++) {
    $apiOk = Test-Url $apiUrl
    $webOk = Test-Url $webUrl
    if ($apiOk -and $webOk) { break }
    Start-Sleep -Seconds 1
}

if ($webOk) {
    Write-Host 'Web is ready. Opening Firefox...' -ForegroundColor Green
    if (Test-Path $firefox) {
        Start-Process -FilePath $firefox -ArgumentList $webUrl
    } else {
        Start-Process $webUrl
    }
    Write-Host ''
    Write-Host 'Login: http://localhost:3000/login' -ForegroundColor Cyan
    Write-Host 'Live:  http://localhost:3000/dashboard' -ForegroundColor Cyan
    Write-Host 'Demo:  http://localhost:3000/demo/dashboard' -ForegroundColor DarkGray
} else {
    Write-Warning 'Web server did not become ready in time.'
    Write-Host 'Run manually: npm run dev:web'
}

Write-Host ''
Write-Host 'To stop the servers:' -ForegroundColor DarkGray
Write-Host 'Get-Content "$env:TEMP\isp-billing-pids.txt" | ForEach-Object { Stop-Process -Id $_ -Force }' -ForegroundColor DarkGray
