$ErrorActionPreference = "Stop"

$workerUrlValue = $env:DEFLOOD_WORKER_URL
$adminToken = $env:DEFLOOD_WORKER_ADMIN_TOKEN

if ([string]::IsNullOrWhiteSpace($workerUrlValue)) {
    throw "DEFLOOD_WORKER_URL is required."
}
if ([string]::IsNullOrWhiteSpace($adminToken)) {
    throw "DEFLOOD_WORKER_ADMIN_TOKEN is required."
}
$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
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
$state = @{
    UpdateAttempted = $false
}

function Write-CloudflaredLine {
    param(
        [string]$Line,
        [hashtable]$State,
        [string]$TunnelPattern,
        [string]$AdminEndpoint,
        [string]$AdminToken
    )

    if ($null -eq $Line) {
        return
    }

    Write-Host $Line

    if (-not $State.UpdateAttempted -and $Line -match $TunnelPattern) {
        $State.UpdateAttempted = $true
        $tunnelOrigin = "https://{0}" -f $Matches.host
        try {
            $body = @{ origin = $tunnelOrigin } | ConvertTo-Json -Compress
            $response = Invoke-RestMethod `
                -Method Post `
                -Uri $AdminEndpoint `
                -Headers @{ Authorization = "Bearer $AdminToken" } `
                -ContentType "application/json" `
                -Body $body
            if ($response.updated -ne $true) {
                throw "The gateway response did not confirm the update."
            }
            Write-Host "DeFlood gateway updated successfully" -ForegroundColor Green
        } catch {
            Write-Warning "Failed to update the DeFlood gateway: $($_.Exception.Message)"
        }
    }
}

function Receive-CloudflaredEvent {
    param(
        $EventRecord,
        [string]$StdoutSourceIdentifier,
        [string]$StderrSourceIdentifier,
        [hashtable]$State,
        [string]$TunnelPattern,
        [string]$AdminEndpoint,
        [string]$AdminToken
    )

    if ($null -eq $EventRecord) {
        return
    }

    try {
        if (
            $EventRecord.SourceIdentifier -eq $StdoutSourceIdentifier `
            -or $EventRecord.SourceIdentifier -eq $StderrSourceIdentifier
        ) {
            Write-CloudflaredLine `
                -Line $EventRecord.SourceEventArgs.Data `
                -State $State `
                -TunnelPattern $TunnelPattern `
                -AdminEndpoint $AdminEndpoint `
                -AdminToken $AdminToken
        }
    } finally {
        Remove-Event -EventIdentifier $EventRecord.EventIdentifier -ErrorAction SilentlyContinue
    }
}

Write-Host "Starting the DeFlood n8n Quick Tunnel..."

$cloudflaredPath = $cloudflaredCommand.Source
if ([string]::IsNullOrWhiteSpace($cloudflaredPath)) {
    $cloudflaredPath = $cloudflaredCommand.Definition
}

$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = $cloudflaredPath
$startInfo.Arguments = "tunnel --url http://localhost:5678"
$startInfo.UseShellExecute = $false
$startInfo.CreateNoWindow = $true
# Keep both native streams as text so Windows PowerShell never converts normal stderr logs into ErrorRecord objects.
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $startInfo
$process.EnableRaisingEvents = $true

$identifierSuffix = [Guid]::NewGuid().ToString("N")
$stdoutSourceIdentifier = "DeFloodCloudflaredStdout-$identifierSuffix"
$stderrSourceIdentifier = "DeFloodCloudflaredStderr-$identifierSuffix"
$stdoutSubscription = $null
$stderrSubscription = $null

try {
    $stdoutSubscription = Register-ObjectEvent `
        -InputObject $process `
        -EventName OutputDataReceived `
        -SourceIdentifier $stdoutSourceIdentifier
    $stderrSubscription = Register-ObjectEvent `
        -InputObject $process `
        -EventName ErrorDataReceived `
        -SourceIdentifier $stderrSourceIdentifier

    if (-not $process.Start()) {
        throw "cloudflared could not be started."
    }

    $process.BeginOutputReadLine()
    $process.BeginErrorReadLine()

    while (-not $process.HasExited) {
        $queuedEvents = @(
            Get-Event -SourceIdentifier $stdoutSourceIdentifier -ErrorAction SilentlyContinue
            Get-Event -SourceIdentifier $stderrSourceIdentifier -ErrorAction SilentlyContinue
        )
        if ($queuedEvents.Count -eq 0) {
            Start-Sleep -Milliseconds 100
            continue
        }
        foreach ($eventRecord in $queuedEvents) {
            Receive-CloudflaredEvent `
                -EventRecord $eventRecord `
                -StdoutSourceIdentifier $stdoutSourceIdentifier `
                -StderrSourceIdentifier $stderrSourceIdentifier `
                -State $state `
                -TunnelPattern $tunnelPattern `
                -AdminEndpoint $adminEndpoint `
                -AdminToken $adminToken
        }
    }

    $process.WaitForExit()

    $remainingEvents = @(
        Get-Event -SourceIdentifier $stdoutSourceIdentifier -ErrorAction SilentlyContinue
        Get-Event -SourceIdentifier $stderrSourceIdentifier -ErrorAction SilentlyContinue
    )
    foreach ($eventRecord in $remainingEvents) {
        Receive-CloudflaredEvent `
            -EventRecord $eventRecord `
            -StdoutSourceIdentifier $stdoutSourceIdentifier `
            -StderrSourceIdentifier $stderrSourceIdentifier `
            -State $state `
            -TunnelPattern $tunnelPattern `
            -AdminEndpoint $adminEndpoint `
            -AdminToken $adminToken
    }

    if ($process.ExitCode -ne 0) {
        throw "cloudflared exited with code $($process.ExitCode)."
    }
} finally {
    Unregister-Event -SourceIdentifier $stdoutSourceIdentifier -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier $stderrSourceIdentifier -ErrorAction SilentlyContinue
    if ($null -ne $stdoutSubscription) {
        Remove-Job -Job $stdoutSubscription -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $stderrSubscription) {
        Remove-Job -Job $stderrSubscription -Force -ErrorAction SilentlyContinue
    }
    $process.Dispose()
}
