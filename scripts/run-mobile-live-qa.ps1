param()
$ErrorActionPreference='Stop'
$runner=Join-Path $PSScriptRoot 'check-mobile-live-qa.cjs'
if (-not (Test-Path -LiteralPath $runner)) { throw 'Keep check-mobile-live-qa.cjs beside this runner.' }
$nodeExe=(Get-Command node.exe -ErrorAction Stop).Source
$taskOutput=Join-Path ([IO.Path]::GetTempPath()) ('himoto-live-qa-'+[Guid]::NewGuid().ToString('N'))
$taskInput=$null
$taskAdmin=$null
$taskBranch=$null
$taskProcess=$null
try {
    Write-Host 'Enter the two Himoto WEB QA accounts in the credential dialogs. No .env file is read.'
    $taskAdmin=Get-Credential -Message 'Himoto WEB QA ADMIN account (not Windows/Vercel credentials)'
    if (-not $taskAdmin) { throw 'QA credential entry cancelled.' }
    $taskBranch=Get-Credential -Message 'Himoto WEB QA BRANCH account (not Windows/Vercel credentials)'
    if (-not $taskBranch) { throw 'QA credential entry cancelled.' }
    $taskInput=@{
        admin=@{username=$taskAdmin.UserName;password=$taskAdmin.GetNetworkCredential().Password}
        branch=@{username=$taskBranch.UserName;password=$taskBranch.GetNetworkCredential().Password}
    } | ConvertTo-Json -Compress -Depth 4
    $taskStart=New-Object Diagnostics.ProcessStartInfo
    $taskStart.FileName=$nodeExe
    $taskStart.Arguments='"'+$runner+'" --output "'+$taskOutput+'"'
    $taskStart.UseShellExecute=$false
    $taskStart.CreateNoWindow=$true
    $taskStart.RedirectStandardInput=$true
    $taskStart.RedirectStandardOutput=$true
    $taskStart.RedirectStandardError=$true
    if ($taskStart.PSObject.Properties['StandardInputEncoding']) { $taskStart.StandardInputEncoding=New-Object Text.UTF8Encoding($false) }
    $taskProcess=New-Object Diagnostics.Process
    $taskProcess.StartInfo=$taskStart
    [void]$taskProcess.Start()
    $taskOutRead=$taskProcess.StandardOutput.ReadToEndAsync()
    $taskErrRead=$taskProcess.StandardError.ReadToEndAsync()
    # Windows PowerShell 5 lacks StandardInputEncoding. ASCII JSON escapes keep
    # non-ASCII passwords intact under any Windows console encoding.
    $taskInput=[regex]::Replace($taskInput,'[^\x20-\x7e]',{ param($character) '\u{0:x4}' -f [int][char]$character.Value })
    $taskProcess.StandardInput.Write($taskInput)
    $taskProcess.StandardInput.Close()
    $taskInput=$null;$taskAdmin=$null;$taskBranch=$null
    Write-Host 'Testing live sessions and read permissions. Business data is not changed.'
    $taskProcess.WaitForExit()
    Write-Output $taskOutRead.Result
    if ($taskErrRead.Result) { Write-Output $taskErrRead.Result }
    Write-Host ('Result metadata: '+(Join-Path $taskOutput 'results.json'))
    exit $taskProcess.ExitCode
} finally {
    $taskInput=$null;$taskAdmin=$null;$taskBranch=$null
    if ($taskProcess) { $taskProcess.Dispose() }
}
