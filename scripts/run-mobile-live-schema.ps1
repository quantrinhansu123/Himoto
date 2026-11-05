param(
    [Parameter(Mandatory=$true)][string]$Output,
    [switch]$ReadLocalDatabaseUrl
)
$ErrorActionPreference = 'Stop'
$previousDatabaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')
try {
    if ($ReadLocalDatabaseUrl) {
        # Use only after the user explicitly permits this exception to the no-env-file rule.
        # Do not dot-source the file or print/copy its contents. Stop at DATABASE_URL.
        $taskReader = [IO.File]::OpenText((Join-Path $PSScriptRoot '..\.env.local'))
        try {
            while ($null -ne ($taskLine = $taskReader.ReadLine())) {
                if ($taskLine -match '^\s*DATABASE_URL\s*=\s*"([^"]+)"\s*$') {
                    [Environment]::SetEnvironmentVariable('DATABASE_URL', $Matches[1], 'Process')
                    break
                }
            }
        } finally { $taskReader.Dispose(); $taskLine = $null; $Matches = $null }
    }
    if (-not [Environment]::GetEnvironmentVariable('DATABASE_URL', 'Process')) { throw 'DATABASE_URL is not available to this process.' }
    & node (Join-Path $PSScriptRoot 'check-mobile-live-schema.cjs') --output $Output
    if ($LASTEXITCODE -ne 0) { throw 'Read-only preflight failed. See the sanitized error code.' }
} finally {
    [Environment]::SetEnvironmentVariable('DATABASE_URL', $previousDatabaseUrl, 'Process')
    $previousDatabaseUrl = $null
}
