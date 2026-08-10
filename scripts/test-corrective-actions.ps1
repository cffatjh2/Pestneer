$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-corrective-actions-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-corrective-actions-$runId.db"
$outputLog = Join-Path $env:TEMP 'pesneer-corrective-actions-test.out.log'
$errorLog = Join-Path $env:TEMP 'pesneer-corrective-actions-test.err.log'
Remove-Item -LiteralPath $testDb, $outputLog, $errorLog -Force -ErrorAction SilentlyContinue
dotnet build $project -c Release -o $buildDirectory | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Test derlemesi oluşturulamadı.' }

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousConnection = $env:ConnectionStrings__Pesneer
$previousProvider = $env:DatabaseProvider
$previousUrls = $env:ASPNETCORE_URLS
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Pesneer = "Data Source=$testDb"
$env:DatabaseProvider = 'Sqlite'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5099'

$portalEmail = "kalite.portal.$runId@example.com"
$process = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:5099/api/health' -TimeoutSec 1
            $ready = $true
            break
        }
        catch { if ($process.HasExited) { break } }
    }
    if (-not $ready) { throw "API başlatılamadı: $(Get-Content $errorLog -Raw -ErrorAction SilentlyContinue)" }

    $owner = Invoke-RestMethod 'http://127.0.0.1:5099/api/auth/owner/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $ownerHeaders = @{ Authorization = "Bearer $($owner.accessToken)" }
    try {
        $customer = Invoke-RestMethod 'http://127.0.0.1:5099/api/company/customers' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
            legalName = 'Kalite Test Müşterisi'; contactName = 'Test Yetkili'; email = 'kalite@example.com'; address = 'Ankara'; city = 'Ankara'; district = 'Çankaya'
            portalContactName = 'Test Yetkili'; portalEmail = $portalEmail; portalPassword = '123456'
        } | ConvertTo-Json)
    }
    catch {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        throw $reader.ReadToEnd()
    }
    try {
        $action = Invoke-RestMethod 'http://127.0.0.1:5099/api/corrective-actions/' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
            customerId = $customer.id; category = 'Yapısal Uygunsuzluk'; title = 'Dış kapı izolasyon eksikliği'
            problem = 'Dış kapı altında kemirgen girişine uygun açıklık görüldü.'; rootCause = 'Kapı altı fitili aşınmış.'
            proposedAction = 'Kapı altı fırçalı fitil ile kalıcı olarak kapatılmalı.'; responsibleParty = 'Customer'; priority = 'High'; dueDate = (Get-Date).AddDays(7).ToString('yyyy-MM-dd')
        } | ConvertTo-Json)
    }
    catch {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        throw $reader.ReadToEnd()
    }
    try {
        $completed = Invoke-RestMethod "http://127.0.0.1:5099/api/corrective-actions/$($action.id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
            title = $action.title; problem = $action.problem; rootCause = $action.rootCause; proposedAction = $action.proposedAction
            responsibleParty = $action.responsibleParty; priority = $action.priority; dueDate = "$($action.dueDate)"; status = 'Completed'; note = 'Müşteri doğrulamasına gönderildi.'
        } | ConvertTo-Json)
    }
    catch {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        throw $reader.ReadToEnd()
    }
    $customerSession = Invoke-RestMethod 'http://127.0.0.1:5099/api/auth/customer/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = $portalEmail; password = '123456' } | ConvertTo-Json)
    $customerHeaders = @{ Authorization = "Bearer $($customerSession.accessToken)" }
    $visible = @(Invoke-RestMethod 'http://127.0.0.1:5099/api/corrective-actions/' -Headers $customerHeaders)
    $approval = Invoke-RestMethod "http://127.0.0.1:5099/api/customer/portal/corrective-actions/$($action.id)/approval" -Method Post -ContentType 'application/json' -Headers $customerHeaders -Body (@{ approved = $true; note = 'Faaliyet yerinde kontrol edildi.' } | ConvertTo-Json)
    [pscustomobject]@{ Health = $health.status; Created = $action.number; OwnerStatus = $completed.status; CustomerVisible = $visible.Count; CustomerApproval = $approval.customerApprovalStatus; HistoryCount = $approval.history.Count }
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    $env:ASPNETCORE_URLS = $previousUrls
}
