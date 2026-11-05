param()
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskOutput=Join-Path $taskRoot '.backups/Himoto-Android-release-key-20261105.himoto-key'
if(Test-Path -LiteralPath $taskOutput){throw 'Encrypted backup already exists. Keep it; do not overwrite.'}
$taskSecure=Read-Host 'Create a NEW backup passphrase (at least 16 characters; save in your password manager)' -AsSecureString
$taskConfirm=Read-Host 'Repeat the backup passphrase' -AsSecureString
$taskPass=(New-Object Management.Automation.PSCredential('backup',$taskSecure)).GetNetworkCredential().Password
$taskPassConfirm=(New-Object Management.Automation.PSCredential('backup',$taskConfirm)).GetNetworkCredential().Password
if($taskPass.Length -lt 16 -or $taskPass -cne $taskPassConfirm){throw 'Passphrases must match and be at least 16 characters.'}
$taskProtected=ConvertTo-SecureString ([IO.File]::ReadAllText((Join-Path $taskRoot '.backups/mobile-android-signing-20261105/password.dpapi')))
$taskKeyPassword=(New-Object Management.Automation.PSCredential('signing',$taskProtected)).GetNetworkCredential().Password
try{
    $taskInput=@{passphrase=$taskPass;keystorePassword=$taskKeyPassword;output=$taskOutput}|ConvertTo-Json -Compress
    $taskInput=[regex]::Replace($taskInput,'[^\x20-\x7e]',{param($character)'\u{0:x4}'-f[int][char]$character.Value})
    $taskStart=New-Object Diagnostics.ProcessStartInfo
    $taskStart.FileName=(Get-Command node.exe).Source
    $taskStart.Arguments='"'+(Join-Path $PSScriptRoot 'mobile-signing-backup.cjs')+'"'
    $taskStart.UseShellExecute=$false;$taskStart.CreateNoWindow=$true
    $taskStart.RedirectStandardInput=$true;$taskStart.RedirectStandardOutput=$true;$taskStart.RedirectStandardError=$true
    $taskProcess=New-Object Diagnostics.Process;$taskProcess.StartInfo=$taskStart;[void]$taskProcess.Start()
    $taskOut=$taskProcess.StandardOutput.ReadToEndAsync();$taskErr=$taskProcess.StandardError.ReadToEndAsync()
    $taskProcess.StandardInput.Write($taskInput);$taskProcess.StandardInput.Close();$taskProcess.WaitForExit()
    Write-Output $taskOut.Result
    if($taskProcess.ExitCode -ne 0){throw 'Backup encryption failed. The original key is retained.'}
    Write-Host ('Copy this ENCRYPTED file to a second secure location: '+$taskOutput)
    Write-Host 'Keep the backup passphrase separately. Do not send it in chat.'
}finally{
    $taskInput=$null;$taskPass=$null;$taskPassConfirm=$null;$taskKeyPassword=$null;$taskSecure=$null;$taskConfirm=$null;$taskProtected=$null
    if($taskProcess){$taskProcess.Dispose()}
}
