param([Parameter(Mandatory=$true)][string]$Output,[string]$GoogleServicesFile,[ValidateSet('arm64-v8a','arm64-v8a,x86_64')][string]$Architectures='arm64-v8a',[string]$ResumePreparedBuild)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskOutput=[IO.Path]::GetFullPath((Join-Path $taskRoot $Output))
if (-not $taskOutput.StartsWith((Join-Path $taskRoot '.backups\'),[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $taskOutput)) { throw 'Use a new output directory inside .backups.' }
[void](New-Item -ItemType Directory -Path $taskOutput)
$taskMobile=Join-Path $taskRoot 'mobile'
$taskConfig=Get-Content -LiteralPath (Join-Path $taskMobile 'app.json') -Raw | ConvertFrom-Json
$taskVersion=[string]$taskConfig.expo.version
$taskVersionCode=[int]$taskConfig.expo.android.versionCode
if($taskVersion -notmatch '^\d+\.\d+\.\d+$' -or $taskVersionCode -lt 1){throw 'Invalid Android version in app.json.'}
$taskGoogleHash=$null
if($GoogleServicesFile){
    $GoogleServicesFile=(Resolve-Path -LiteralPath $GoogleServicesFile).Path
    $taskGoogle=Get-Content -LiteralPath $GoogleServicesFile -Raw | ConvertFrom-Json
    if($taskGoogle.project_info.project_id -ne 'himoto-70f21' -or @($taskGoogle.client | Where-Object {$_.client_info.android_client_info.package_name -eq 'vn.himoto.staff'}).Count -ne 1){throw 'Firebase configuration does not match the authorized Himoto Android project.'}
    $taskGoogleHash=(Get-FileHash -LiteralPath $GoogleServicesFile -Algorithm SHA256).Hash.ToLowerInvariant()
}
$taskSigning=Join-Path $taskRoot '.backups/mobile-android-signing-20261105'
$taskSigningManifest=Get-Content -LiteralPath (Join-Path $taskSigning 'manifest.json') -Raw | ConvertFrom-Json
$taskKey=Join-Path $taskSigning $taskSigningManifest.keystore
if ((Get-FileHash -LiteralPath $taskKey -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskSigningManifest.keystoreSha256) { throw 'Signing keystore hash mismatch.' }
$taskPassword=(New-Object Management.Automation.PSCredential('signing',(ConvertTo-SecureString ([IO.File]::ReadAllText((Join-Path $taskSigning 'password.dpapi')))))).GetNetworkCredential().Password
$taskNames=@('HIMOTO_ANDROID_LOCAL_SIGNING','HIMOTO_ANDROID_KEYSTORE_PATH','HIMOTO_ANDROID_KEYSTORE_PASSWORD','HIMOTO_ANDROID_KEY_ALIAS','HIMOTO_ANDROID_KEY_PASSWORD','HIMOTO_ANDROID_GOOGLE_SERVICES_FILE','EXPO_PUBLIC_ENVIRONMENT')
$taskPrevious=@{};foreach($taskName in $taskNames){$taskPrevious[$taskName]=[Environment]::GetEnvironmentVariable($taskName,'Process')}
try {
    $env:HIMOTO_ANDROID_LOCAL_SIGNING='1'
    $env:HIMOTO_ANDROID_GOOGLE_SERVICES_FILE=$GoogleServicesFile
    $env:HIMOTO_ANDROID_KEYSTORE_PATH=$taskKey
    $env:HIMOTO_ANDROID_KEYSTORE_PASSWORD=$taskPassword
    $env:HIMOTO_ANDROID_KEY_ALIAS=$taskSigningManifest.alias
    $env:HIMOTO_ANDROID_KEY_PASSWORD=$taskPassword
    $env:JAVA_HOME='E:\Java\temurin-21\jdk-21.0.12.1+1'
    $env:ANDROID_HOME='E:\Android\Sdk';$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
    $env:GRADLE_USER_HOME='E:\Android\Gradle'
    $env:TEMP=Join-Path $taskRoot '.backups/mobile-tmp-20261105';$env:TMP=$env:TEMP
    $env:EXPO_NO_DOTENV='1';$env:EXPO_OFFLINE='1';$env:EXPO_NO_TELEMETRY='1'
    $env:EXPO_PUBLIC_API_URL='https://himoto.vercel.app'
    $env:EXPO_PUBLIC_ENVIRONMENT='production'
    $env:CMAKE_BUILD_PARALLEL_LEVEL='1'
    & node (Join-Path $PSScriptRoot 'mobile-release-provenance.cjs') --manifest (Join-Path $taskOutput 'source-manifest.json')
    if($LASTEXITCODE -ne 0){throw 'Release source snapshot failed.'}
    if($ResumePreparedBuild){
        $taskResume=(Resolve-Path -LiteralPath (Join-Path $taskRoot $ResumePreparedBuild)).Path
        if(-not $taskResume.StartsWith((Join-Path $taskRoot '.backups\'),[StringComparison]::OrdinalIgnoreCase)){throw 'Resume must reference a prepared build inside .backups.'}
        & node (Join-Path $PSScriptRoot 'mobile-release-provenance.cjs') --manifest (Join-Path $taskResume 'source-manifest.json') --verify
        if($LASTEXITCODE -ne 0){throw 'Prepared build source no longer matches.'}
        if(-not $GoogleServicesFile -or (Get-FileHash -LiteralPath (Join-Path $taskMobile 'android/app/google-services.json') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskGoogleHash){throw 'Prepared native Firebase configuration differs.'}
        'Reusing prepared Android project after source and Firebase hash verification.' | Set-Content -LiteralPath (Join-Path $taskOutput 'prebuild.log')
    }else{
      Push-Location $taskMobile
      try {
        $ErrorActionPreference='Continue'
        & node node_modules/expo/bin/cli prebuild --platform android --no-install *> (Join-Path $taskOutput 'prebuild.log')
        $taskCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
        if($taskCode -ne 0){throw 'Expo Android prebuild failed. See prebuild.log.'}
      } finally { Pop-Location }
    }
    $taskGradle=Join-Path $taskMobile 'android/app/build.gradle'
    $taskGradleText=[IO.File]::ReadAllText($taskGradle)
    if(-not $taskGradleText.Contains('// @generated begin himoto-release-signing') -or -not $taskGradleText.Contains('signingConfig signingConfigs.release')){throw 'Release signing plugin was not applied.'}
    Push-Location (Join-Path $taskMobile 'android')
    try {
        $taskArguments=@(':app:assembleRelease','--no-daemon','--console=plain','--max-workers=1','-Dorg.gradle.parallel=false','-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m -XX:ActiveProcessorCount=2','-Pkotlin.compiler.execution.strategy=in-process','-Pandroid.cmakeVersion=3.31.6',('-PreactNativeArchitectures='+$Architectures))
        $ErrorActionPreference='Continue'
        & .\gradlew.bat @taskArguments *> (Join-Path $taskOutput 'gradle.log')
        $taskCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
        if($taskCode -ne 0){throw 'Android release Gradle build failed. See gradle.log.'}
    } finally { Pop-Location }
    $taskApk=Join-Path $taskOutput "Himoto-$taskVersion-android-release.apk"
    Copy-Item -LiteralPath (Join-Path $taskMobile 'android/app/build/outputs/apk/release/app-release.apk') -Destination $taskApk
    $taskTools='E:\Android\Sdk\build-tools\37.0.0'
    $ErrorActionPreference='Continue'
    $taskCert=& (Join-Path $taskTools 'apksigner.bat') verify --verbose --print-certs $taskApk 2>&1
    $taskCode=$LASTEXITCODE;$ErrorActionPreference='Stop'
    if($taskCode -ne 0){throw 'APK signature verification failed.'}
    $taskCert | Set-Content -LiteralPath (Join-Path $taskOutput 'apk-certificate-public.txt')
    $taskCertMatch=($taskCert | Select-String -Pattern 'certificate SHA-256 digest: ([0-9a-f]{64})' | Select-Object -First 1)
    if(-not $taskCertMatch -or $taskCertMatch.Matches[0].Groups[1].Value -ne $taskSigningManifest.certificateSha256){throw 'APK certificate differs from the release key.'}
    $taskBadging=& (Join-Path $taskTools 'aapt2.exe') dump badging $taskApk
    if($LASTEXITCODE -ne 0){throw 'Cannot inspect APK manifest.'}
    $taskBadging | Set-Content -LiteralPath (Join-Path $taskOutput 'apk-badging.txt')
    if(@($taskBadging | Where-Object {$_ -match '^application-debuggable'}).Count -gt 0){throw 'Release APK is debuggable.'}
    if(-not ($taskBadging | Select-String -SimpleMatch "package: name='vn.himoto.staff' versionCode='$taskVersionCode' versionName='$taskVersion'")){throw 'APK identity/version mismatch.'}
    & python (Join-Path $PSScriptRoot 'verify-mobile-release-bundle.py') --apk $taskApk --require-offline
    if($LASTEXITCODE -ne 0){throw 'Compiled bundle/Firebase/native module verification failed.'}
    & node (Join-Path $PSScriptRoot 'mobile-release-provenance.cjs') --manifest (Join-Path $taskOutput 'source-manifest.json') --verify
    if($LASTEXITCODE -ne 0){throw 'Release source changed during build.'}
    if($GoogleServicesFile -and (Get-FileHash -LiteralPath $GoogleServicesFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskGoogleHash){throw 'Firebase configuration changed during build.'}
    [ordered]@{ok=$true;version=$taskVersion;versionCode=$taskVersionCode;package='vn.himoto.staff';apk=$taskApk;bytes=(Get-Item -LiteralPath $taskApk).Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $taskApk).Hash.ToLowerInvariant();certificateSha256=$taskSigningManifest.certificateSha256;debuggable=$false;apiOrigin='https://himoto.vercel.app';firebaseAndroidConfigured=[bool]$GoogleServicesFile;firebaseConfigSha256=$taskGoogleHash;dotenvDisabled=$true;sourceUnchanged=$true;installed=$false;nativeAcceptance=$false;portableKeyBackupCompleted=$false;completedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskOutput 'results.json') -Encoding UTF8
    Get-Content -LiteralPath (Join-Path $taskOutput 'results.json')
} finally {
    foreach($taskName in $taskNames){[Environment]::SetEnvironmentVariable($taskName,$taskPrevious[$taskName],'Process')}
    $taskPassword=$null
}
