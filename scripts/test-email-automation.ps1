$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-email-automation-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-email-automation-$runId.db"
$apiOutputLog = Join-Path $env:TEMP 'pesneer-email-automation-test.out.log'
$apiErrorLog = Join-Path $env:TEMP 'pesneer-email-automation-test.err.log'
$mockOutputLog = Join-Path $env:TEMP 'pesneer-email-google-mock.out.log'
$mockErrorLog = Join-Path $env:TEMP 'pesneer-email-google-mock.err.log'
Remove-Item -LiteralPath $testDb, $apiOutputLog, $apiErrorLog, $mockOutputLog, $mockErrorLog -Force -ErrorAction SilentlyContinue
dotnet build $project -c Release -o $buildDirectory | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Test derlemesi oluşturulamadı.' }

$environmentKeys = @(
    'ASPNETCORE_ENVIRONMENT', 'ConnectionStrings__Pesneer', 'DatabaseProvider', 'ASPNETCORE_URLS',
    'Email__Enabled', 'Email__GoogleClientId', 'Email__GoogleClientSecret', 'Email__GoogleTokenUrl',
    'Email__GoogleUserInfoUrl', 'Email__GoogleGmailApiBaseUrl', 'Email__PublicBaseUrl', 'Email__FrontendBaseUrl'
)
$previousEnvironment = @{}
foreach ($key in $environmentKeys) { $previousEnvironment[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }

$apiBaseUrl = 'http://127.0.0.1:5106'
$googleBaseUrl = 'http://127.0.0.1:5110'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Pesneer = "Data Source=$testDb"
$env:DatabaseProvider = 'Sqlite'
$env:ASPNETCORE_URLS = $apiBaseUrl
$env:Email__Enabled = 'false'
$env:Email__GoogleClientId = 'mock-client'
$env:Email__GoogleClientSecret = 'mock-secret'
$env:Email__GoogleTokenUrl = "$googleBaseUrl/token"
$env:Email__GoogleUserInfoUrl = "$googleBaseUrl/userinfo"
$env:Email__GoogleGmailApiBaseUrl = "$googleBaseUrl/gmail/v1"
$env:Email__PublicBaseUrl = $apiBaseUrl
$env:Email__FrontendBaseUrl = 'http://127.0.0.1:5173'

$pythonCommand = Get-Command python -ErrorAction Stop
$mockProcess = Start-Process $pythonCommand.Source -ArgumentList @((Join-Path $PSScriptRoot 'mock-google-email-server.py'), '5110') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $mockOutputLog -RedirectStandardError $mockErrorLog -PassThru
$apiProcess = $null

try {
    $mockReady = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try { $null = Invoke-RestMethod "$googleBaseUrl/state" -TimeoutSec 1; $mockReady = $true; break }
        catch { if ($mockProcess.HasExited) { break } }
    }
    if (-not $mockReady) { throw "Google test servisi başlatılamadı: $(Get-Content $mockErrorLog -Raw -ErrorAction SilentlyContinue)" }

    $apiProcess = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $apiOutputLog -RedirectStandardError $apiErrorLog -PassThru
    $apiReady = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 300
        try { $health = Invoke-RestMethod "$apiBaseUrl/api/health" -TimeoutSec 1; $apiReady = $true; break }
        catch { if ($apiProcess.HasExited) { break } }
    }
    if (-not $apiReady) { throw "API başlatılamadı: $(Get-Content $apiErrorLog -Raw -ErrorAction SilentlyContinue)" }

    $owner = Invoke-RestMethod "$apiBaseUrl/api/auth/owner/login" -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $headers = @{ Authorization = "Bearer $($owner.accessToken)" }
    $connect = Invoke-RestMethod "$apiBaseUrl/api/company/branding/email/google/connect" -Method Post -Headers $headers
    $stateMatch = [regex]::Match($connect.authorizationUrl, '[?&]state=([^&]+)')
    if (-not $stateMatch.Success) { throw 'OAuth state değeri üretilemedi.' }
    $state = [Uri]::UnescapeDataString($stateMatch.Groups[1].Value)
    $null = Invoke-WebRequest "$apiBaseUrl/api/company/branding/email/google/callback?code=mock-code&state=$([Uri]::EscapeDataString($state))"

    $branding = Invoke-RestMethod "$apiBaseUrl/api/company/branding" -Headers $headers
    if (-not $branding.emailOAuthConnected -or $branding.emailDeliveryProvider -notlike 'Gmail*') {
        throw 'Gmail bağlantısı firma ayarlarına yansımadı.'
    }

    $recipient = "email.test.$runId@example.com"
    $testResult = Invoke-RestMethod "$apiBaseUrl/api/company/branding/email/test" -Method Post -ContentType 'application/json' -Headers $headers -Body (@{ email = $recipient } | ConvertTo-Json)
    $mockState = Invoke-RestMethod "$googleBaseUrl/state"
    if (-not $testResult.sent -or $mockState.sentMessages -ne 1) { throw 'Gmail API teslimatı tamamlanmadı.' }

    [pscustomobject]@{
        Health = $health.status
        OAuthConnected = $branding.emailOAuthConnected
        Provider = $branding.emailDeliveryProvider
        Recipient = $recipient
        SentMessages = $mockState.sentMessages
    }
}
finally {
    if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force }
    if ($mockProcess -and -not $mockProcess.HasExited) { Stop-Process -Id $mockProcess.Id -Force }
    foreach ($key in $environmentKeys) { [Environment]::SetEnvironmentVariable($key, $previousEnvironment[$key], 'Process') }
}
