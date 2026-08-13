$ErrorActionPreference = 'Stop'

$apiDirectory = Join-Path $PSScriptRoot '..\backend\src\Pesneer.Api'
$databasePath = Join-Path $env:TEMP "pestneer-station-activation-test-$PID.db"
$baseUrl = 'http://127.0.0.1:5112'
if (Test-Path -LiteralPath $databasePath) { Remove-Item -LiteralPath $databasePath -Force }

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$previousUrls = $env:ASPNETCORE_URLS
$previousConnection = $env:ConnectionStrings__Pesneer
$previousProvider = $env:DatabaseProvider
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = $baseUrl
$env:ConnectionStrings__Pesneer = "Data Source=$databasePath"
$env:DatabaseProvider = 'Sqlite'
$assemblyPath = Join-Path $apiDirectory 'bin\Debug\net8.0\Pesneer.Api.dll'
$standardOutput = Join-Path $env:TEMP "pestneer-station-test-$PID.out.log"
$standardError = Join-Path $env:TEMP "pestneer-station-test-$PID.err.log"
$licensePath = Join-Path $env:TEMP "pestneer-license-test-$PID.txt"
$customerEmail = "aktivasyon-musteri-$PID@test.local"
Set-Content -LiteralPath $licensePath -Value 'Test biyosidal ürün ruhsatı' -Encoding utf8
$process = Start-Process dotnet -ArgumentList @($assemblyPath) -WorkingDirectory $apiDirectory -WindowStyle Hidden -RedirectStandardOutput $standardOutput -RedirectStandardError $standardError -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { Invoke-WebRequest "$baseUrl/api/health" -UseBasicParsing | Out-Null; $ready = $true; break } catch { }
    }
    if (-not $ready) {
        $details = ((Get-Content $standardOutput -ErrorAction SilentlyContinue) + (Get-Content $standardError -ErrorAction SilentlyContinue)) -join [Environment]::NewLine
        throw "Test API başlatılamadı. $details"
    }

    $owner = Invoke-RestMethod "$baseUrl/api/auth/owner/login" -Method Post -ContentType 'application/json' -Body (@{
        companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456'
    } | ConvertTo-Json)
    $headers = @{ Authorization = "Bearer $($owner.accessToken)" }
    $catalog = Invoke-RestMethod "$baseUrl/api/service-reports/catalog" -Headers $headers
    $runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $employee = Invoke-RestMethod "$baseUrl/api/company/employees" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        firstName = 'Aktivasyon'; lastName = 'Personeli'; phoneNumber = '05000000000'; email = "aktivasyon-$runId@test.local"
        role = 'Technician'; password = '123456'; canSelfSchedule = $false
    } | ConvertTo-Json)
    $customer = Invoke-RestMethod "$baseUrl/api/company/customers" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        legalName = "Aktivasyon Müşterisi $runId"; code = $null; contactName = 'Test Yetkili'; phoneNumber = '05000000001'
        email = $customerEmail; address = 'Ankara'; city = 'Ankara'; district = 'Çankaya'; latitude = $null; longitude = $null
        mapUrl = $null; portalContactName = 'Aktivasyon Yetkilisi'; portalEmail = $customerEmail; portalPassword = '123456'
    } | ConvertTo-Json)
    $branches = @(Invoke-RestMethod "$baseUrl/api/company/customers/$($customer.id)/branches/bulk" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        branches = @(@{ name = 'Merkez'; code = $null; address = 'Çankaya Ankara'; city = 'Ankara'; district = 'Çankaya'; contactName = 'Şube Yetkilisi'; phoneNumber = '05000000002'; email = $customerEmail; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null })
    } | ConvertTo-Json -Depth 5))
    $branch = $branches[0]

    $orders = @(Invoke-RestMethod "$baseUrl/api/company/work-orders/batch" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        customerId = $customer.id; branchIds = @($branch.id); serviceType = 'İstasyon aktivasyon kontrolü'
        date = (Get-Date).ToString('yyyy-MM-dd'); time = '10:00'; durationMinutes = 60
        employeeAccountId = $employee.id; visitType = 'Routine'; recurrenceType = 'Once'
    } | ConvertTo-Json -Depth 5))
    $station = @{
        deviceNumber = 'M 01'; area = 'Üretim çıkışı'; deviceType = 'M'; targetPest = 'Ev faresi'
        caughtCount = 2; hasActivity = $true; plateChanged = $false; deviceStatus = 'Activity'
        activityType = 'Capture'; notes = 'Uçtan uca test kaydı'
    }
    $draft = Invoke-RestMethod "$baseUrl/api/station-activations/work-orders/$($orders[0].id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        notes = 'Test turu'; finalize = $false; stations = @($station)
    } | ConvertTo-Json -Depth 8)
    $final = Invoke-RestMethod "$baseUrl/api/station-activations/work-orders/$($orders[0].id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        notes = 'Test turu'; finalize = $true; stations = @($station)
    } | ConvertTo-Json -Depth 8)
    $pdf = Invoke-WebRequest "$baseUrl/api/station-activations/$($final.id)/pdf" -Headers $headers -UseBasicParsing
    $documents = @(Invoke-RestMethod "$baseUrl/api/quality/documents?category=StationActivations" -Headers $headers)
    $inventory = Invoke-RestMethod "$baseUrl/api/company/inventory/entries" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        name = "Test Biyosidal $runId"; category = 'Biyosidal Ürün'; quantity = 5; unit = 'Litre'
        minimumQuantity = 1; unitCost = 100; lotNumber = "LOT-$runId"
    } | ConvertTo-Json)

    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    try {
        $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $owner.accessToken)
        $multipart = [System.Net.Http.MultipartFormDataContent]::new()
        $fileContent = [System.Net.Http.ByteArrayContent]::new([System.IO.File]::ReadAllBytes($licensePath))
        $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::new('text/plain')
        $multipart.Add($fileContent, 'file', [System.IO.Path]::GetFileName($licensePath))
        $multipart.Add([System.Net.Http.StringContent]::new('Licenses'), 'category')
        $multipart.Add([System.Net.Http.StringContent]::new('Test ürün ruhsatı'), 'title')
        $multipart.Add([System.Net.Http.StringContent]::new($inventory.id), 'inventoryItemId')
        $multipart.Add([System.Net.Http.StringContent]::new("RUHSAT-$runId"), 'licenseNumber')
        $uploadResponse = $client.PostAsync("$baseUrl/api/quality/documents/upload", $multipart).GetAwaiter().GetResult()
        if (-not $uploadResponse.IsSuccessStatusCode) { throw "Ruhsat yüklenemedi: $($uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult())" }
        $license = $uploadResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    }
    finally { $client.Dispose() }

    $vehicle = Invoke-RestMethod "$baseUrl/api/company/inventory/vehicles" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        plate = "06T$($runId.Substring(0, 4))"; brand = 'Test'; model = 'Saha'; modelYear = 2026; assignedEmployeeAccountId = $employee.id
    } | ConvertTo-Json)
    $transfer = Invoke-RestMethod "$baseUrl/api/company/inventory/transfers" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        inventoryItemId = $inventory.id; vehicleId = $vehicle.id; quantity = 1; note = 'Ruhsat bağlantı testi'
    } | ConvertTo-Json)
    $vehicleStock = @($transfer.vehicle.stockItems)[0]
    $report = Invoke-RestMethod "$baseUrl/api/service-reports/work-orders/$($orders[0].id)" -Method Put -ContentType 'application/json; charset=utf-8' -Headers $headers -Body (@{
        firmName = 'Tura Çevre Sağlığı'; targetPests = $catalog.pestTypes[0]; residenceType = $catalog.residenceTypes[0]; workType = $catalog.workTypes[0]
        safetyMeasures = $catalog.safetyMeasures[0]; applicationSummary = 'Test uygulaması'
        additionalEmailRecipients = @("ek-rapor-$runId@test.local")
        managerSignatureData = 'test-manager-signature'; customerSignatureData = 'test-customer-signature'; finalize = $true
        stations = @(); products = @(@{
            vehicleStockItemId = $vehicleStock.id; productName = $vehicleStock.productName; amountUsed = 30; unit = 'Mililitre'
        })
    } | ConvertTo-Json -Depth 8)
    $inventoryAfterLicense = @((Invoke-RestMethod "$baseUrl/api/company/inventory" -Headers $headers) | Where-Object { $_.id -eq $inventory.id })[0]

    $customerSession = Invoke-RestMethod "$baseUrl/api/auth/customer/login" -Method Post -ContentType 'application/json' -Body (@{
        companyCode = 'TURA-ANKARA'; email = $customerEmail; password = '123456'
    } | ConvertTo-Json)
    $customerHeaders = @{ Authorization = "Bearer $($customerSession.accessToken)" }
    $customerActivations = @(Invoke-RestMethod "$baseUrl/api/quality/documents?category=StationActivations" -Headers $customerHeaders)
    $customerLicenses = @(Invoke-RestMethod "$baseUrl/api/quality/documents?category=Licenses" -Headers $customerHeaders)
    [pscustomobject]@{
        login = [bool]$owner.accessToken
        singleLocationCreated = $branch.name -eq 'Merkez' -and $branch.email -eq $customerEmail
        draft = $draft.status
        final = $final.status
        stations = $final.totalStations
        pdfContentType = $pdf.Headers['Content-Type']
        pdfBytes = $pdf.RawContentLength
        documentArchived = $documents.Count -gt 0
        customerActivationVisible = $customerActivations.Count -gt 0
        licenseUploaded = [bool]$license.id
        inventoryLicenseLinked = $inventoryAfterLicense.licenseDocumentId -eq $license.id -and $inventoryAfterLicense.licenseNumber -eq "RUHSAT-$runId"
        vehicleLicenseLinked = $vehicleStock.licenseDocumentId -eq $license.id
        reportLicensePinned = @($report.products)[0].licenseDocumentId -eq $license.id -and @($report.products)[0].licenseNumber -eq "RUHSAT-$runId"
        emailRecipientsQueued = $report.emailRecipientCount -ge 3 -and $report.emailDeliveryStatus -eq 'Pending'
        customerLicenseVisible = $customerLicenses.Count -gt 0
    } | ConvertTo-Json
}
catch {
    $responseBody = ''
    if ($_.Exception.Response) {
        $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
        try { $responseBody = $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    $serverLog = ((Get-Content $standardOutput -Tail 120 -ErrorAction SilentlyContinue) + (Get-Content $standardError -Tail 120 -ErrorAction SilentlyContinue)) -join [Environment]::NewLine
    throw "$($_.Exception.Message)$([Environment]::NewLine)$responseBody$([Environment]::NewLine)$serverLog"
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force; $process.WaitForExit() }
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ASPNETCORE_URLS = $previousUrls
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    if (Test-Path -LiteralPath $databasePath) { Remove-Item -LiteralPath $databasePath -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $standardOutput, $standardError, $licensePath -Force -ErrorAction SilentlyContinue
}
