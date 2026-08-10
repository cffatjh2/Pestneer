$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$project = Join-Path $root 'backend/src/Pesneer.Api/Pesneer.Api.csproj'
$projectDirectory = Split-Path $project -Parent
$buildDirectory = Join-Path $env:TEMP 'pesneer-contract-packages-build'
$assembly = Join-Path $buildDirectory 'Pesneer.Api.dll'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 8)
$testDb = Join-Path $env:TEMP "pesneer-contract-packages-$runId.db"
$outputLog = Join-Path $env:TEMP 'pesneer-contract-packages-test.out.log'
$errorLog = Join-Path $env:TEMP 'pesneer-contract-packages-test.err.log'
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
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5104'
$customerEmail = "sozlesme.musteri.$runId@example.com"
$employeeEmail = "sozlesme.personel.$runId@example.com"
$process = Start-Process dotnet -ArgumentList @($assembly) -WorkingDirectory $projectDirectory -WindowStyle Hidden -RedirectStandardOutput $outputLog -RedirectStandardError $errorLog -PassThru

try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 400
        try { $health = Invoke-RestMethod 'http://127.0.0.1:5104/api/health' -TimeoutSec 1; $ready = $true; break }
        catch { if ($process.HasExited) { break } }
    }
    if (-not $ready) { throw "API başlatılamadı: $(Get-Content $errorLog -Raw -ErrorAction SilentlyContinue)" }

    $owner = Invoke-RestMethod 'http://127.0.0.1:5104/api/auth/owner/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = 'sahip@mail.com'; password = '123456' } | ConvertTo-Json)
    $ownerHeaders = @{ Authorization = "Bearer $($owner.accessToken)" }
    $employee = Invoke-RestMethod 'http://127.0.0.1:5104/api/company/employees' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ firstName = 'Sözleşme'; lastName = 'Personeli'; phoneNumber = '05000000000'; email = $employeeEmail; role = 'Technician'; password = '123456'; canSelfSchedule = $false } | ConvertTo-Json)
    $customer = Invoke-RestMethod 'http://127.0.0.1:5104/api/company/customers' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ legalName = "Sözleşme Müşterisi $runId"; code = $null; contactName = 'Test Yetkili'; phoneNumber = '05000000001'; email = $customerEmail; address = 'Ankara'; city = 'Ankara'; district = 'Çankaya'; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = 'Müşteri Yetkilisi'; portalEmail = $customerEmail; portalPassword = '123456' } | ConvertTo-Json)
    $branches = @(Invoke-RestMethod "http://127.0.0.1:5104/api/company/customers/$($customer.id)/branches/bulk" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ branches = @(@{ name = 'Test Şubesi'; code = $null; address = 'Çankaya Ankara'; city = 'Ankara'; district = 'Çankaya'; contactName = 'Şube Yetkilisi'; phoneNumber = '05000000002'; email = $null; latitude = $null; longitude = $null; mapUrl = $null; portalContactName = $null; portalEmail = $null; portalPassword = $null }) } | ConvertTo-Json -Depth 5))
    $today = (Get-Date).ToString('yyyy-MM-dd')
    $proposal = Invoke-RestMethod 'http://127.0.0.1:5104/api/company/commercial/proposals' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{ customerId = $customer.id; branchId = $branches[0].id; title = 'Yıllık Entegre Zararlı Yönetimi'; issueDate = $today; validUntil = (Get-Date).AddDays(30).ToString('yyyy-MM-dd'); vatRate = 20; discountAmount = 0; notes = 'Faz 4 testi'; terms = 'Aylık periyodik hizmet'; lines = @(@{ description = 'Aylık periyodik mücadele'; quantity = 12; unit = 'Ziyaret'; unitPrice = 1000 }) } | ConvertTo-Json -Depth 5)

    $customerLogin = Invoke-RestMethod 'http://127.0.0.1:5104/api/auth/customer/login' -Method Post -ContentType 'application/json' -Body (@{ companyCode = 'TURA-ANKARA'; email = $customerEmail; password = '123456' } | ConvertTo-Json)
    $customerHeaders = @{ Authorization = "Bearer $($customerLogin.accessToken)" }
    $accepted = Invoke-RestMethod "http://127.0.0.1:5104/api/customer/portal/commercial/proposals/$($proposal.id)/decision" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $customerHeaders -Body (@{ accepted = $true; note = 'Dijital onay verildi.' } | ConvertTo-Json)
    if ($accepted.status -ne 'Accepted') { throw 'Teklif müşteri tarafından onaylanamadı.' }

    $contract = Invoke-RestMethod "http://127.0.0.1:5104/api/company/commercial/proposals/$($proposal.id)/convert" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $ownerHeaders -Body (@{
        startDate = $today; endDate = (Get-Date).AddDays(365).ToString('yyyy-MM-dd'); billingFrequency = 'Monthly'; billingDay = 1; paymentTermDays = 15; periodAmount = 1200; scope = 'Aylık periyodik mücadele'; terms = 'Sözleşme test koşulları';
        autoRenew = $true; renewalNoticeDays = 60; annualPriceIncreaseRate = 20; freeEmergencyCallsPerYear = 1; extraEmergencyCallPrice = 2500; responseTimeHours = 4;
        servicePlans = @(@{ branchId = $branches[0].id; employeeAccountId = $employee.id; serviceType = 'Periyodik Zararlı Mücadelesi'; recurrenceType = 'Monthly'; visitsPerPeriod = 1; preferredDay = 1; preferredTime = '09:30'; durationMinutes = 75; branchPrice = 1200 })
    } | ConvertTo-Json -Depth 6)
    if ($contract.servicePlans.Count -ne 1 -or $contract.generatedWorkOrderCount -lt 1) { throw 'Sözleşme hizmet planı veya otomatik işler oluşturulamadı.' }

    $generation = Invoke-RestMethod "http://127.0.0.1:5104/api/company/commercial/contracts/$($contract.id)/generate-work-orders" -Method Post -ContentType 'application/json' -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)
    if ($generation.createdCount -ne 0 -or $generation.skippedExistingCount -lt 1) { throw 'Tekrarlı iş emri koruması çalışmadı.' }

    $requestBody = @{ branchId = $branches[0].id; requestType = 'EmergencyCall'; subject = 'Acil kemirgen aktivitesi'; serviceType = 'Standard'; priority = 'Urgent'; description = 'Depo bölümünde yeni kemirgen aktivitesi görüldü.'; contactPhone = '05000000001'; dueAt = $null; requestedAppointmentAt = $null }
    $firstCall = Invoke-RestMethod 'http://127.0.0.1:5104/api/customer/portal/requests' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $customerHeaders -Body ($requestBody | ConvertTo-Json)
    $secondCall = Invoke-RestMethod 'http://127.0.0.1:5104/api/customer/portal/requests' -Method Post -ContentType 'application/json; charset=utf-8' -Headers $customerHeaders -Body ($requestBody | ConvertTo-Json)
    if ($firstCall.contractCoverage -ne 'FreeAllowance' -or $firstCall.serviceType -ne 'EmergencyFree' -or -not $firstCall.slaDueAt) { throw 'Ücretsiz acil çağrı hakkı veya SLA sınıflandırması hatalı.' }
    if ($secondCall.contractCoverage -ne 'OutOfContractPaid' -or $secondCall.serviceType -ne 'EmergencyPaid' -or $secondCall.chargeAmount -ne 2500) { throw 'Ücretli acil çağrı sınıflandırması hatalı.' }

    $commercial = Invoke-RestMethod 'http://127.0.0.1:5104/api/customer/portal/commercial' -Headers $customerHeaders
    if ($commercial.contracts[0].servicePlans.Count -ne 1 -or $commercial.contracts[0].freeEmergencyCallsPerYear -ne 1) { throw 'Hizmet paketi müşteri portalına yansımadı.' }

    [pscustomobject]@{ Health = $health.status; Contract = $contract.number; ServicePlans = $contract.servicePlans.Count; GeneratedOrders = $contract.generatedWorkOrderCount; DuplicateProtection = $generation.skippedExistingCount; FirstEmergency = $firstCall.contractCoverage; SecondEmergency = $secondCall.contractCoverage; Charged = $secondCall.chargeAmount; CustomerPortal = $commercial.contracts.Count }
}
finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
    $env:ConnectionStrings__Pesneer = $previousConnection
    $env:DatabaseProvider = $previousProvider
    $env:ASPNETCORE_URLS = $previousUrls
}
