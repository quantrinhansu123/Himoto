param([switch]$CompleteExisting)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskFolder=Join-Path $taskRoot '.backups/mobile-android-signing-20261105'
$taskKeytool='E:\Java\temurin-21\jdk-21.0.12.1+1\bin\keytool.exe'
if (-not (Test-Path -LiteralPath $taskKeytool)) { throw 'Configured JDK keytool is missing.' }
if ((Test-Path -LiteralPath $taskFolder) -and -not $CompleteExisting) { throw 'Signing folder exists. Preserve the current key; do not regenerate.' }
if (Test-Path -LiteralPath (Join-Path $taskFolder 'manifest.json')) { throw 'Signing already initialized. Use the existing key.' }
if (-not (Test-Path -LiteralPath $taskFolder)) { [void](New-Item -ItemType Directory -Path $taskFolder) }
$taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls.exe $taskFolder '/inheritance:r' '/grant:r' ('*'+$taskSid+':(OI)(CI)F') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict signing folder ACL.' }
$taskBytes=New-Object byte[] 32
if ($CompleteExisting) {
    $taskSecure=ConvertTo-SecureString ([IO.File]::ReadAllText((Join-Path $taskFolder 'password.dpapi')))
    $taskPassword=(New-Object Management.Automation.PSCredential('signing',$taskSecure)).GetNetworkCredential().Password
} else {
    $taskRandom=[Security.Cryptography.RandomNumberGenerator]::Create()
    $taskRandom.GetBytes($taskBytes);$taskRandom.Dispose()
    $taskPassword=[Convert]::ToBase64String($taskBytes)
    $taskSecure=ConvertTo-SecureString $taskPassword -AsPlainText -Force
    $taskProtected=ConvertFrom-SecureString $taskSecure
    [IO.File]::WriteAllText((Join-Path $taskFolder 'password.dpapi'),$taskProtected,(New-Object Text.UTF8Encoding($false)))
}
$taskKeystore=Join-Path $taskFolder 'himoto-release.p12'
$taskCertificate=Join-Path $taskFolder 'himoto-release.cer'
$taskAlias='himoto-release-20261105'
$taskPrevious=[Environment]::GetEnvironmentVariable('HIMOTO_SIGNING_TOOL_PASSWORD','Process')
try {
    [Environment]::SetEnvironmentVariable('HIMOTO_SIGNING_TOOL_PASSWORD',$taskPassword,'Process')
    if (-not (Test-Path -LiteralPath $taskKeystore)) {
        $ErrorActionPreference='Continue'
        & $taskKeytool -genkeypair -keystore $taskKeystore -storetype PKCS12 -alias $taskAlias -keyalg RSA -keysize 3072 -validity 10000 -storepass:env HIMOTO_SIGNING_TOOL_PASSWORD -keypass:env HIMOTO_SIGNING_TOOL_PASSWORD -dname 'CN=Himoto Android,OU=Mobile,O=Himoto,C=VN' *> (Join-Path $taskFolder 'keytool-public.log')
        $taskCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
        if ($taskCode -ne 0) { throw 'Key generation failed; preserve diagnostics and do not overwrite the key folder.' }
    }
    $ErrorActionPreference='Continue'
    & $taskKeytool -exportcert -keystore $taskKeystore -alias $taskAlias -storepass:env HIMOTO_SIGNING_TOOL_PASSWORD -file $taskCertificate *> (Join-Path $taskFolder 'certificate-public.log')
    $taskCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
    if ($taskCode -ne 0) { throw 'Public certificate export failed.' }
    [ordered]@{format='PKCS12';alias=$taskAlias;keystore='himoto-release.p12';passwordProtection='Windows DPAPI CurrentUser; plaintext not written';certificateSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $taskCertificate).Hash.ToLowerInvariant();keystoreSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $taskKeystore).Hash.ToLowerInvariant();firstRelease=$true;portableOwnerBackupCompleted=$false;createdAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskFolder 'manifest.json') -Encoding UTF8
    Write-Output 'New release key created; restricted ACL, password protected with CurrentUser DPAPI. No password printed.'
    Get-Content -LiteralPath (Join-Path $taskFolder 'manifest.json')
} finally {
    [Environment]::SetEnvironmentVariable('HIMOTO_SIGNING_TOOL_PASSWORD',$taskPrevious,'Process')
    $taskPassword=$null;$taskSecure=$null;$taskProtected=$null;[Array]::Clear($taskBytes,0,$taskBytes.Length)
}
