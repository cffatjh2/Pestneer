$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-health-waste-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-health-waste-$runId.db"
$evidenceFile = Join-Path $env:TEMP "pesneer-waste-proof-$runId.txt"
$outputLog = Join-Path $env:TEMP 'pesneer-health-waste-test.out.log'
$errorLog = Join-Path $env:TEMP 'pesneer-health-waste-test.err.log'
Remove-Item -LiteralPath $testDb, $evidenceFile, $outputLog, $errorLog -Force -ErrorAction SilentlyContinue
'Opsiyonel bertaraf kaniti' | Set-Content -LiteralPath $evidenceFile -Encoding utf8
dotnet build $project -c Release -o $buildDirectory | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Test derlemesi oluşturulamadı.' }

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousConnection = $env:ConnectionStrings__Pesneer
$previousProvider = $env:DatabaseProvider
$previousUrls = $env:ASPNETCORE_URLS
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Pesneer = "Data Source=$testDb"
$env:DatabaseProvider = 'Sqlite'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5096'
$customerEmail = "saglik.musteri.$runId@example.com"
$process = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $health = Invoke-RestMethod 'http://127.0.0.1:5096/api/health' -TimeoutSec 1; $ready = $true; break }
        catch { if ($process.HasExited) { break } }
    }
    if (-not $ready) { throw "API başlatılamadı: $(Get-Content $errorLog -Raw -ErrorAction SilentlyContinue)" }
    $owner = Invoke-RestMethod 'http://127.0.0.1:5096/api/auth/owner/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $headers = @{ Authorization = "Bearer $($owner.accessToken)" }
    $customer = Invoke-RestMethod 'http://127.0.0.1:5096/api/company/customers' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ legalName = "Saglik Musterisi $runId"; code = $null; contactName = 'Test Yetkili'; phoneNumber = $null; email = $customerEmail; address = 'Ankara'; city = 'Ankara'; district = 'Cankaya'; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = 'Saglik Musterisi'; portalEmail = $customerEmail; portalPassword = '123456' } | ConvertTo-Json)
    $branches = @(Invoke-RestMethod "http://127.0.0.1:5096/api/company/customers/$($customer.id)/branches/bulk" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ branches = @(@{ name = 'Test Sube'; code = $null; address = 'Ankara'; city = 'Ankara'; district = 'Cankaya'; contactName = $null; phoneNumber = $null; email = $null; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null }) } | ConvertTo-Json -Depth 5))

    $scores = Invoke-RestMethod 'http://127.0.0.1:5096/api/company/health-scores' -Headers $headers
    $branchScore = @($scores.locations | Where-Object { $_.branchId -eq $branches[0].id })[0]
    if ($branchScore.periodComparisonAvailable) { throw 'Geçmiş saha verisi olmadan dönem karşılaştırması açıldı.' }

    $created = Invoke-RestMethod 'http://127.0.0.1:5096/api/company/waste-disposals/' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ customerId = $customer.id; branchId = $branches[0].id; workOrderId = $null; wasteType = 'GlueBoard'; quantity = 2; unit = 'Adet'; status = 'Generated'; generatedAt = (Get-Date).ToString('o'); temporaryStorage = $null; recipientName = $null; carrierOrFacility = $null; disposalMethod = $null; documentNumber = $null; notes = 'Bu kayıt opsiyoneldir.' } | ConvertTo-Json)
    $updated = Invoke-RestMethod "http://127.0.0.1:5096/api/company/waste-disposals/$($created.id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{ wasteType = $created.wasteType; quantity = $created.quantity; unit = $created.unit; status = 'Disposed'; generatedAt = $created.generatedAt; temporaryStorage = $null; recipientName = 'Test Teslim Alan'; carrierOrFacility = 'Lisansli Tesis'; disposalMethod = 'Yetkili tesise teslim'; documentNumber = 'BT-001'; notes = $created.notes } | ConvertTo-Json)
    $uploadJson = & curl.exe -sS -X POST -H "Authorization: Bearer $($owner.accessToken)" -F "file=@$evidenceFile;type=text/plain" -F "note=Teslim kaniti" "http://127.0.0.1:5096/api/company/waste-disposals/$($created.id)/evidence"
    if ($LASTEXITCODE -ne 0) { throw 'Kanıt yükleme isteği başarısız oldu.' }
    $upload = $uploadJson | ConvertFrom-Json
    $records = @(Invoke-RestMethod 'http://127.0.0.1:5096/api/company/waste-disposals/' -Headers $headers)
    $customerSession = Invoke-RestMethod 'http://127.0.0.1:5096/api/auth/customer/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = $customerEmail; password = '123456' } | ConvertTo-Json)
    $customerScores = Invoke-RestMethod 'http://127.0.0.1:5096/api/customer/portal/health-scores' -Headers @{ Authorization = "Bearer $($customerSession.accessToken)" }
    [pscustomobject]@{ Health = $health.status; LocationCount = @($scores.locations).Count; CustomerLocationCount = @($customerScores.locations).Count; ComparisonAvailable = $branchScore.periodComparisonAvailable; HealthScore = $branchScore.score; WasteNumber = $created.number; WasteStatus = $updated.status; EvidenceCount = @($upload.evidence).Count; RecordCount = $records.Count }
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    Remove-Item -LiteralPath $evidenceFile -Force -ErrorAction SilentlyContinue
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    $env:ASPNETCORE_URLS = $previousUrls
}
