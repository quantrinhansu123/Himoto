$ErrorActionPreference = 'Stop'
$trainingRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$trainingBuild = Join-Path $trainingRoot '.backups/training-delivery-1.0.6'
$trainingMobile = Join-Path $trainingBuild 'source/mobile'
if (!(Test-Path -LiteralPath (Join-Path $trainingMobile 'app.json'))) { throw 'Prepare the isolated training source first.' }
$trainingConfig = Get-Content -LiteralPath (Join-Path $trainingMobile 'app.json') -Raw | ConvertFrom-Json
if ($trainingConfig.expo.android.package -ne 'vn.himoto.training') { throw 'This runner cannot build the production package.' }
$env:JAVA_HOME = 'E:/Java/temurin-21/jdk-21.0.12.1+1'
$env:ANDROID_HOME = 'E:/Android/Sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = 'E:/Android/Gradle'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:EXPO_OFFLINE = '1'
$env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:8156'
$env:EXPO_PUBLIC_ENVIRONMENT = 'training'
$env:HIMOTO_ANDROID_GOOGLE_SERVICES_FILE = $null
$env:HIMOTO_ANDROID_LOCAL_SIGNING = $null
$env:CI = '1'
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
Push-Location -LiteralPath $trainingMobile
try {
    $ErrorActionPreference = 'Continue'
    & node --require (Join-Path $trainingRoot 'scripts/training/windows_glob.cjs') node_modules/expo/bin/cli prebuild --platform android --no-install *> (Join-Path $trainingBuild 'prebuild.log')
    $trainingCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($trainingCode -ne 0) { throw 'Training prebuild failed; inspect its private log.' }
    Push-Location -LiteralPath (Join-Path $trainingMobile 'android')
    try {
        $ErrorActionPreference = 'Continue'
        & .\gradlew.bat :app:assembleRelease --no-daemon --console=plain --max-workers=1 '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=768m -XX:ActiveProcessorCount=2' '-Pkotlin.compiler.execution.strategy=in-process' '-Pandroid.cmakeVersion=3.31.6' '-PreactNativeArchitectures=arm64-v8a' *> (Join-Path $trainingBuild 'gradle.log')
        $trainingCode = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($trainingCode -ne 0) { throw 'Training Android build failed; inspect its private log.' }
    } finally { Pop-Location }
    Copy-Item -LiteralPath 'android/app/build/outputs/apk/release/app-release.apk' -Destination (Join-Path $trainingBuild 'Himoto-1.0.6-training.apk')
} finally { Pop-Location }
