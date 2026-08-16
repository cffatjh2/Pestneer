$ErrorActionPreference = 'Stop'

function Get-HttpErrorMessage($errorRecord) {
    if ($errorRecord.ErrorDetails.Message) { return $errorRecord.ErrorDetails.Message }
    if ($errorRecord.Exception.Response -and $errorRecord.Exception.Response.Content) {
        return $errorRecord.Exception.Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }

    return $errorRecord.Exception.Message
}

$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-audit-packages-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-audit-packages-$runId.db"
$pdfFile = Join-Path $env:TEMP "pesneer-audit-$runId.pdf"
$ownerReportPdfFile = Join-Path $env:TEMP "pesneer-service-report-owner-$runId.pdf"
$customerReportPdfFile = Join-Path $env:TEMP "pesneer-service-report-customer-$runId.pdf"
$zipFile = Join-Path $env:TEMP "pesneer-audit-$runId.zip"
$outputLog = Join-Path $env:TEMP 'pesneer-audit-packages-test.out.log'
$errorLog = Join-Path $env:TEMP 'pesneer-audit-packages-test.err.log'
Remove-Item -LiteralPath $testDb, $pdfFile, $ownerReportPdfFile, $customerReportPdfFile, $zipFile, $outputLog, $errorLog -Force -ErrorAction SilentlyContinue
dotnet build $project -c Release -o $buildDirectory | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Test derlemesi oluşturulamadı.' }

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousConnection = $env:ConnectionStrings__Pesneer
$previousProvider = $env:DatabaseProvider
$previousUrls = $env:ASPNETCORE_URLS
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ConnectionStrings__Pesneer = "Data Source=$testDb"
$env:DatabaseProvider = 'Sqlite'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5105'
$customerEmail = "denetim.musteri.$runId@example.com"
$employeeEmail = "denetim.personel.$runId@example.com"
$process = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 400
        try { $health = Invoke-RestMethod 'http://127.0.0.1:5105/api/health' -TimeoutSec 1; $ready = $true; break }
        catch { if ($process.HasExited) { break } }
    }
    if (-not $ready) { throw "API başlatılamadı: $(Get-Content $errorLog -Raw -ErrorAction SilentlyContinue)" }

    $owner = Invoke-RestMethod 'http://127.0.0.1:5105/api/auth/owner/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $ownerHeaders = @{ Authorization = "Bearer $($owner.accessToken)" }
    $employee = Invoke-RestMethod 'http://127.0.0.1:5105/api/company/employees' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ firstName = 'Denetim'; lastName = 'Personeli'; phoneNumber = '05000000000'; email = $employeeEmail; role = 'Technician'; password = '123456'; canSelfSchedule = $false } | ConvertTo-Json)
    $customer = Invoke-RestMethod 'http://127.0.0.1:5105/api/company/customers' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ legalName = "Denetim Müşterisi $runId"; code = $null; contactName = 'Test Yetkili'; phoneNumber = '05000000001'; email = $customerEmail; address = 'Ankara'; city = 'Ankara'; district = 'Çankaya'; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = 'Denetim Yetkilisi'; portalEmail = $customerEmail; portalPassword = '123456' } | ConvertTo-Json)
    $branches = @(Invoke-RestMethod "http://127.0.0.1:5105/api/company/customers/$($customer.id)/branches/bulk" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ branches = @(@{ name = 'Üretim Şubesi'; code = $null; address = 'Çankaya Ankara'; city = 'Ankara'; district = 'Çankaya'; contactName = 'Şube Yetkilisi'; phoneNumber = '05000000002'; email = $null; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null }) } | ConvertTo-Json -Depth 5))
    $today = (Get-Date).ToString('yyyy-MM-dd')

    $orders = @(Invoke-RestMethod 'http://127.0.0.1:5105/api/company/work-orders/batch' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ customerId = $customer.id; branchIds = @($branches[0].id); serviceType = 'Periyodik zararlı mücadelesi'; date = $today; time = '10:00'; durationMinutes = 60; employeeAccountId = $employee.id; visitType = 'Routine'; recurrenceType = 'Once' } | ConvertTo-Json -Depth 5))
    try {
    $report = Invoke-RestMethod "http://127.0.0.1:5105/api/service-reports/work-orders/$($orders[0].id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
        firmName = 'Tura Çevre Sağlığı'; firmAddress = 'Ankara'; firmPhone = $null; firmWeb = $null; responsibleManager = 'Mesul Müdür'; permissionNumber = 'TEST-001'; teamManager = 'Denetim Personeli'; targetPests = 'Norveç sıçanı'; residenceType = 'Gıda üretim tesisi'; areaSquareMeters = 1200; workType = 'Kemirgen kontrolü'; consumables = $null; safetyMeasures = 'Diğer: Alan güvenliği sağlandı.';
        applicationSummary = 'Tüm istasyonlar kontrol edildi.'; findings = 'M-01 istasyonunda aktivite görüldü.'; correctiveActions = 'İzleme sıklığı artırıldı.'; recommendations = 'Kapı altı izolasyonu önerildi.';
        customerRepresentativeName = 'Test Yetkili'; managerSignatureData = 'data:image/png;base64,dGVzdA=='; customerSignatureData = 'data:image/png;base64,dGVzdA=='; baseUpdatedAt = $null; forceOverwrite = $false; finalize = $true;
        stations = @(@{ sitePlanId = $null; sitePlanElementId = $null; deviceNumber = 'M-01'; area = 'Üretim çıkışı'; deviceType = 'M'; targetPest = $null; caughtCount = 0; hasActivity = $false; plateChanged = $false; deviceStatus = 'NoActivity'; activityType = $null; inaccessibilityReason = $null; appliedVehicleStockItemId = $null; appliedProductName = $null; appliedAmount = $null; appliedUnit = $null; replacementVehicleStockItemId = $null; replacementProductName = $null; replacementQuantity = $null; replacementUnit = $null; notes = 'Kontrol tamamlandı.' });
        products = @(@{ vehicleStockItemId = $null; productName = 'Test Rodentisit'; licenseNumber = 'RHS-001'; applicationMethod = 'İstasyon içine uygulama'; dilutionRate = $null; activeIngredient = 'Brodifacoum'; antidote = 'Vitamin K1'; packingQuantity = '1 kg'; amountUsed = 0; unit = 'Gram' })
    } | ConvertTo-Json -Depth 8)
    }
    catch {
        throw (Get-HttpErrorMessage $_)
    }

    Invoke-WebRequest "http://127.0.0.1:5105/api/service-reports/$($report.id)/pdf" -Headers $ownerHeaders -OutFile $ownerReportPdfFile | Out-Null
    $ownerReportPdfHeader = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($ownerReportPdfFile), 0, 4)
    if ($ownerReportPdfHeader -ne '%PDF') { throw 'Firma sahibi servis raporu PDF çıktısına erişemedi.' }

    $plan = Invoke-RestMethod 'http://127.0.0.1:5105/api/site-plans/' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
        customerId = $customer.id; branchId = $branches[0].id; title = 'Zararlı Mücadelesi Ekipman Yerleşim Planı'; areaName = 'Üretim ve dış alan'; fieldGuide = 'BRCGS / Saha Kılavuzu'; revisionNote = 'İlk yayın';
        canvas = @{ width = 1200; height = 720; equipmentTypes = @(@{ id = 'mouse'; code = 'R'; name = 'Dış Alan Yemli İstasyon'; color = '#2563eb'; shape = 'square' }); elements = @(@{ id = 'station-1'; type = 'station'; x = 100; y = 100; width = 36; height = 36; rotation = 0; text = $null; stroke = '#102A43'; fill = '#FFFFFF'; strokeWidth = 2; equipmentTypeId = 'mouse'; stationNumber = 'R-01'; qrCode = 'PST-TEST-R01' }) }
    } | ConvertTo-Json -Depth 8)
    if ($plan.canvas.elements[0].qrCode -ne 'PST-TEST-M01') { throw 'İstasyon QR eşleştirmesi kroki kaydında korunmadı.' }

    $filter = @{ customerId = $customer.id; branchId = $branches[0].id; periodStart = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd'); periodEnd = $today; auditProfile = 'BRCGS'; includeOptionalWaste = $false }
    $preflight = Invoke-RestMethod 'http://127.0.0.1:5105/api/audit-packages/preflight' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body ($filter | ConvertTo-Json)
    if ($preflight.evidenceCount -lt 3 -or $preflight.blockingIssueCount -lt 1) { throw 'Ön kontrol kanıtları veya eksik tespiti beklenen sonucu vermedi.' }

    $createBody = $filter.Clone(); $createBody.acknowledgeWarnings = $true
    $package = Invoke-RestMethod 'http://127.0.0.1:5105/api/audit-packages' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body ($createBody | ConvertTo-Json)
    if ($package.itemCount -lt 3 -or $package.pdfSha256.Length -ne 64 -or $package.zipSha256.Length -ne 64) { throw 'Denetim paketi bütünlük kayıtları oluşturulamadı.' }

    Invoke-WebRequest "http://127.0.0.1:5105$($package.pdfDownloadUrl)" -Headers $ownerHeaders -OutFile $pdfFile | Out-Null
    Invoke-WebRequest "http://127.0.0.1:5105$($package.zipDownloadUrl)" -Headers $ownerHeaders -OutFile $zipFile | Out-Null
    $pdfHeader = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($pdfFile), 0, 4)
    if ($pdfHeader -ne '%PDF') { throw 'PDF çıktısı geçerli değil.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipFile)
    try {
        if (-not ($archive.Entries.Name -contains '00_manifest.json') -or $archive.Entries.Count -lt ($package.itemCount + 2)) { throw 'ZIP manifesti veya kaynak kanıtları eksik.' }
    }
    finally { $archive.Dispose() }

    $customerLogin = Invoke-RestMethod 'http://127.0.0.1:5105/api/auth/customer/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = $customerEmail; password = '123456' } | ConvertTo-Json)
    $customerHeaders = @{ Authorization = "Bearer $($customerLogin.accessToken)" }
    Invoke-WebRequest "http://127.0.0.1:5105/api/service-reports/$($report.id)/pdf" -Headers $customerHeaders -OutFile $customerReportPdfFile | Out-Null
    $customerReportPdfHeader = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($customerReportPdfFile), 0, 4)
    if ($customerReportPdfHeader -ne '%PDF') { throw 'Müşteri servis raporu PDF çıktısına erişemedi.' }
    $customerPackages = @(Invoke-RestMethod 'http://127.0.0.1:5105/api/audit-packages' -Headers $customerHeaders)
    if ($customerPackages.Count -ne 1 -or $customerPackages[0].id -ne $package.id) { throw 'Denetim paketi müşteri portalına yansımadı.' }
    $archiveDocuments = @(Invoke-RestMethod 'http://127.0.0.1:5105/api/quality/documents?category=AuditPackages' -Headers $customerHeaders)
    if ($archiveDocuments.Count -ne 1 -or $archiveDocuments[0].contentType -ne 'application/pdf') { throw 'Denetim PDF belgesi müşteri arşivine kaydedilmedi.' }

    [pscustomobject]@{ Health = $health.status; Report = $report.reportNumber; Plan = $plan.number; Readiness = $preflight.readinessScore; Findings = $preflight.blockingIssueCount; Evidence = $package.itemCount; PdfBytes = (Get-Item $pdfFile).Length; ServicePdfBytes = (Get-Item $customerReportPdfFile).Length; ZipEntries = $package.itemCount + 2; CustomerPortal = $customerPackages.Count; Archive = $archiveDocuments.Count }
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    $env:ASPNETCORE_URLS = $previousUrls
}
