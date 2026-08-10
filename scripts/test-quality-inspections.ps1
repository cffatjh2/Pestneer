$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-quality-inspections-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-quality-inspections-$runId.db"
$outputLog = Join-Path $env:TEMP 'pesneer-quality-inspections-test.out.log'
$errorLog = Join-Path $env:TEMP 'pesneer-quality-inspections-test.err.log'
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
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5098'
$employeeEmail = "kalite.personel.$runId@example.com"
$process = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $health = Invoke-RestMethod 'http://127.0.0.1:5098/api/health' -TimeoutSec 1; $ready = $true; break }
        catch { if ($process.HasExited) { break } }
    }
    if (-not $ready) { throw "API başlatılamadı: $(Get-Content $errorLog -Raw -ErrorAction SilentlyContinue)" }
    $owner = Invoke-RestMethod 'http://127.0.0.1:5098/api/auth/owner/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $headers = @{ Authorization = "Bearer $($owner.accessToken)" }
    $employee = Invoke-RestMethod 'http://127.0.0.1:5098/api/company/employees' -Method Post -ContentType 'application/json' -Headers $headers -Body (@{ firstName = 'Kalite'; lastName = 'Personeli'; phoneNumber = '05000000000'; email = $employeeEmail; role = 'Technician'; password = '123456'; canSelfSchedule = $false } | ConvertTo-Json)
    try {
        $customer = Invoke-RestMethod 'http://127.0.0.1:5098/api/company/customers' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ legalName = "Kalite Musterisi $runId"; code = $null; contactName = 'Test Yetkili'; phoneNumber = $null; email = $null; address = 'Ankara'; city = 'Ankara'; district = 'Cankaya'; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null } | ConvertTo-Json)
    }
    catch {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        throw $reader.ReadToEnd()
    }
    $branches = @(Invoke-RestMethod "http://127.0.0.1:5098/api/company/customers/$($customer.id)/branches/bulk" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ branches = @(@{ name = 'Merkez Sube'; code = $null; address = 'Ankara'; city = 'Ankara'; district = 'Cankaya'; contactName = $null; phoneNumber = $null; email = $null; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null }) } | ConvertTo-Json -Depth 5))
    $orders = @(Invoke-RestMethod 'http://127.0.0.1:5098/api/company/work-orders/batch' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ customerId = $customer.id; branchIds = @($branches[0].id); serviceType = 'Periyodik zararli mucadelesi'; date = (Get-Date).ToString('yyyy-MM-dd'); time = '10:00'; durationMinutes = 60; employeeAccountId = $employee.id; visitType = 'Routine'; recurrenceType = 'Once' } | ConvertTo-Json -Depth 5))
    try {
    $report = Invoke-RestMethod "http://127.0.0.1:5098/api/service-reports/work-orders/$($orders[0].id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        firmName = 'Tura Cevre Sagligi'; firmAddress = $null; firmPhone = $null; firmWeb = $null; responsibleManager = $null; permissionNumber = $null; teamManager = $null; targetPests = 'Rodent'; residenceType = $null; areaSquareMeters = $null; workType = $null; consumables = $null; safetyMeasures = $null;
        applicationSummary = 'Periyodik kontrol tamamlandi.'; findings = 'Test bulgusu'; correctiveActions = $null; recommendations = 'Izleme surdurulmeli.';
        customerRepresentativeName = 'Test Yetkili'; managerSignatureData = 'data:image/png;base64,dGVzdA=='; customerSignatureData = 'data:image/png;base64,dGVzdA=='; baseUpdatedAt = $null; forceOverwrite = $false; finalize = $true;
        stations = @(@{ sitePlanId = $null; sitePlanElementId = $null; deviceNumber = 'M-01'; area = 'Uretim cikisi'; deviceType = 'M'; targetPest = $null; caughtCount = 0; hasActivity = $false; plateChanged = $false; deviceStatus = 'NoActivity'; activityType = $null; inaccessibilityReason = $null; appliedVehicleStockItemId = $null; appliedProductName = $null; appliedAmount = $null; appliedUnit = $null; replacementVehicleStockItemId = $null; replacementProductName = $null; replacementQuantity = $null; replacementUnit = $null; notes = $null });
        products = @()
    } | ConvertTo-Json -Depth 8)
    }
    catch {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        throw $reader.ReadToEnd()
    }
    $candidates = @(Invoke-RestMethod 'http://127.0.0.1:5098/api/company/quality-inspections/candidates' -Headers $headers)
    $inspection = Invoke-RestMethod 'http://127.0.0.1:5098/api/company/quality-inspections/' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ serviceReportId = $report.id; inspectionType = 'RiskBased'; selectionReason = 'Uctan uca kalite testi' } | ConvertTo-Json)
    $completed = Invoke-RestMethod "http://127.0.0.1:5098/api/company/quality-inspections/$($inspection.id)/complete" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ photoQualityScore = 40; stationCompletionScore = 60; productDoseScore = 65; signatureScore = 100; timelinessScore = 70; reportCompletenessScore = 60; findings = 'Fotograf kaniti yetersiz.'; notes = 'Kalite testi'; createCorrectiveAction = $false } | ConvertTo-Json)
    $summary = Invoke-RestMethod 'http://127.0.0.1:5098/api/company/quality-inspections/summary' -Headers $headers
    [pscustomobject]@{ Health = $health.status; CandidateCount = $candidates.Count; Inspection = $inspection.number; Status = $completed.status; Score = $completed.totalScore; Grade = $completed.grade; CorrectiveAction = $completed.correctiveActionNumber; CompletedCount = $summary.completedCount }
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    $env:ASPNETCORE_URLS = $previousUrls
}
