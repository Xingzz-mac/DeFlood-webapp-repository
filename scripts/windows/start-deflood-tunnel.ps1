$ErrorActionPreference = "Stop"

$workerUrlValue = $env:DEFLOOD_WORKER_URL
$adminToken = $env:DEFLOOD_WORKER_ADMIN_TOKEN

if ([string]::IsNullOrWhiteSpace($workerUrlValue)) {
    throw "DEFLOOD_WORKER_URL is required."
}
if ([string]::IsNullOrWhiteSpace($adminToken)) {
    throw "DEFLOOD_WORKER_ADMIN_TOKEN is required."
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw "cloudflared was not found in PATH."
}

try {
    $workerUrl = [System.Uri]$workerUrlValue
} catch {
    throw "DEFLOOD_WORKER_URL must be a valid HTTPS URL."
}
if (
    -not $workerUrl.IsAbsoluteUri `
    -or $workerUrl.Scheme -ne "https" `
    -or $workerUrl.AbsolutePath -ne "/" `
    -or -not [string]::IsNullOrEmpty($workerUrl.Query) `
    -or -not [string]::IsNullOrEmpty($workerUrl.Fragment)
) {
    throw "DEFLOOD_WORKER_URL must be an HTTPS origin without a path, query string, or fragment."
}

$adminEndpoint = "{0}/admin/origin" -f $workerUrlValue.TrimEnd("/")
$tunnelPattern = 'https://(?<host>[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com)(?:/)?'
$updateAttempted = $false

Write-Host "Starting the DeFlood n8n Quick Tunnel..."

& cloudflared tunnel --url http://localhost:5678 2>&1 | ForEach-Object {
    $line = $_.ToString()
    Write-Host $line

    if (-not $updateAttempted -and $line -match $tunnelPattern) {
        $updateAttempted = $true
        $tunnelOrigin = "https://{0}" -f $Matches.host
        try {
            $body = @{ origin = $tunnelOrigin } | ConvertTo-Json -Compress
            $response = Invoke-RestMethod `
                -Method Post `
                -Uri $adminEndpoint `
                -Headers @{ Authorization = "Bearer $adminToken" } `
                -ContentType "application/json" `
                -Body $body
            if ($response.updated -ne $true) {
                throw "The gateway response did not confirm the update."
            }
            Write-Host "DeFlood gateway updated successfully" -ForegroundColor Green
        } catch {
            Write-Error "Failed to update the DeFlood gateway: $($_.Exception.Message)" -ErrorAction Continue
        }
    }
}

$cloudflaredExitCode = $LASTEXITCODE
if ($cloudflaredExitCode -ne 0) {
    throw "cloudflared exited with code $cloudflaredExitCode."
}
