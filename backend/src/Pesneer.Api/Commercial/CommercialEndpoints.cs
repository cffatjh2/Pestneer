using Microsoft.EntityFrameworkCore;
using System.Globalization;
using Pesneer.Api.Data;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Commercial;

public static class CommercialEndpoints
{
    private static readonly HashSet<string> Frequencies = ["Weekly", "Monthly", "Quarterly", "SemiAnnual", "Annual", "Manual"];
    private static readonly HashSet<string> ServiceRecurrences = ["Weekly", "Monthly", "Manual"];

    public static IEndpointRouteBuilder MapCommercialEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/company/commercial").RequireAuthorization("OwnerPortal");
        group.MapGet("/proposals", GetProposalsAsync);
        group.MapPost("/proposals", CreateProposalAsync);
        group.MapGet("/proposals/{proposalId:guid}/pdf", GetProposalPdfAsync);
        group.MapPost("/proposals/{proposalId:guid}/convert", ConvertProposalAsync);
        group.MapGet("/contracts", GetContractsAsync);
        group.MapGet("/contracts/{contractId:guid}/pdf", GetContractPdfAsync);
        group.MapPost("/contracts/{contractId:guid}/generate-work-orders", GenerateContractWorkOrdersAsync);
        group.MapPost("/contracts/{contractId:guid}/renew", RenewContractAsync);
        group.MapGet("/receivables", GetReceivablesAsync);
        group.MapPost("/receivables/{receivableId:guid}/payment", RecordPaymentAsync);
        group.MapPut("/work-orders/{workOrderId:guid}/economics", SaveEconomicsAsync);
        group.MapGet("/profitability", GetProfitabilityAsync);
        return app;
    }

    private static async Task<IResult> GetProposalsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        Results.Ok((await ProposalQuery(dbContext).ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).Select(ToProposal));

    private static async Task<IResult> CreateProposalAsync(CreateProposalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        if (request.Lines.Count == 0 || request.Lines.Any(line => string.IsNullOrWhiteSpace(line.Description) || line.Quantity <= 0 || line.UnitPrice < 0))
            return Validation("lines", "Teklife en az bir geçerli hizmet kalemi ekleyin.");
        if (request.ValidUntil < request.IssueDate) return Validation("validUntil", "Geçerlilik tarihi teklif tarihinden önce olamaz.");
        var customer = await dbContext.Customers.AsNoTracking().SingleOrDefaultAsync(item => item.Id == request.CustomerId && item.IsActive, cancellationToken);
        if (customer is null) return Validation("customerId", "Aktif bir müşteri seçin.");
        if (request.BranchId.HasValue && !await dbContext.CustomerBranches.AnyAsync(item => item.Id == request.BranchId && item.CustomerId == request.CustomerId && item.IsActive, cancellationToken))
            return Validation("branchId", "Müşteriye bağlı aktif bir şube seçin.");
        var subtotal = request.Lines.Sum(line => decimal.Round(line.Quantity * line.UnitPrice, 2));
        var taxable = Math.Max(0, subtotal - request.DiscountAmount);
        var vat = decimal.Round(taxable * request.VatRate / 100m, 2);
        var item = new CommercialProposal
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = request.CustomerId, CustomerBranchId = request.BranchId,
            CreatedByAccountId = context.AccountId.Value, Number = await NextNumberAsync(dbContext.CommercialProposals.Select(value => value.Number), "TKL", cancellationToken),
            Title = request.Title.Trim(), IssueDate = request.IssueDate, ValidUntil = request.ValidUntil, VatRate = request.VatRate,
            DiscountAmount = request.DiscountAmount, Subtotal = subtotal, VatAmount = vat, TotalAmount = taxable + vat,
            Notes = Clean(request.Notes), Terms = Clean(request.Terms), Status = "PendingApproval", Currency = "TRY"
        };
        item.Lines = request.Lines.Select((line, index) => new CommercialProposalLine { Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CommercialProposalId = item.Id, Description = line.Description.Trim(), Quantity = line.Quantity, Unit = line.Unit.Trim(), UnitPrice = line.UnitPrice, LineTotal = decimal.Round(line.Quantity * line.UnitPrice, 2), SortOrder = index }).ToList();
        dbContext.CommercialProposals.Add(item);
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        var savedProposal = await ProposalQuery(dbContext).SingleAsync(value => value.Id == item.Id, cancellationToken);
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(value => value.Id == context.CompanyId.Value, cancellationToken);
        var proposalPdf = CommercialPdfRenderer.Proposal(savedProposal, company);
        dbContext.QualityDocuments.Add(NewCommercialDocument(item.CompanyId, item.CustomerId, item.CustomerBranchId, item.CreatedByAccountId, "CommercialProposals", $"{item.Number} · {item.Title}", $"{item.Number}.pdf", proposalPdf));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/commercial/proposals/{item.Id}", ToProposal(savedProposal));
    }

    private static async Task<IResult> ConvertProposalAsync(Guid proposalId, ConvertProposalRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || !context.AccountId.HasValue) return Results.Forbid();
        if (!Frequencies.Contains(request.BillingFrequency)) return Validation("billingFrequency", "Geçerli bir faturalama periyodu seçin.");
        if (request.EndDate < request.StartDate) return Validation("endDate", "Sözleşme bitiş tarihi başlangıçtan önce olamaz.");
        if (request.RenewalNoticeDays is < 1 or > 365 || request.AnnualPriceIncreaseRate is < 0 or > 500 || request.FreeEmergencyCallsPerYear is < 0 or > 999 || request.ExtraEmergencyCallPrice < 0 || request.ResponseTimeHours is < 1 or > 720)
            return Validation("servicePackage", "Yenileme, acil çağrı ve müdahale süresi değerlerini kontrol edin.");
        var proposal = await dbContext.CommercialProposals.Include(item => item.Lines).SingleOrDefaultAsync(item => item.Id == proposalId, cancellationToken);
        if (proposal is null) return Results.NotFound();
        if (proposal.Status == "Converted") return Validation("proposal", "Bu teklif daha önce sözleşmeye dönüştürüldü.");
        if (proposal.Status != "Accepted") return Validation("proposal", "Teklif sözleşmeye dönüştürülmeden önce müşteri tarafından onaylanmalıdır.");
        var planRequests = request.ServicePlans?.Count > 0 ? request.ServicePlans : [new ContractServicePlanRequest(proposal.CustomerBranchId, null, proposal.Title, "Monthly", 1, Math.Clamp(request.BillingDay, 1, 28), "09:00", 60, request.PeriodAmount ?? proposal.TotalAmount)];
        if (planRequests.Count > 250 || planRequests.Any(plan => !ServiceRecurrences.Contains(plan.RecurrenceType) || string.IsNullOrWhiteSpace(plan.ServiceType) || plan.ServiceType.Trim().Length > 120 || plan.VisitsPerPeriod is < 1 or > 4 || plan.PreferredDay is < 1 or > 28 || !TimeOnly.TryParseExact(plan.PreferredTime, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None, out _) || plan.DurationMinutes is < 15 or > 720 || plan.BranchPrice < 0))
            return Validation("servicePlans", "Hizmet planlarındaki şube, tekrar, saat, ziyaret sayısı veya fiyat bilgisini kontrol edin.");
        if (planRequests.Any(plan => plan.RecurrenceType == "Weekly" && plan.PreferredDay > 7))
            return Validation("servicePlans", "Haftalık hizmet planında gün 1 (Pazartesi) ile 7 (Pazar) arasında olmalıdır.");
        var branchIds = planRequests.Where(plan => plan.BranchId.HasValue).Select(plan => plan.BranchId!.Value).Distinct().ToArray();
        if (branchIds.Length > 0 && await dbContext.CustomerBranches.CountAsync(item => item.CustomerId == proposal.CustomerId && item.IsActive && branchIds.Contains(item.Id), cancellationToken) != branchIds.Length)
            return Validation("servicePlans", "Hizmet planındaki şubelerden biri müşteriye ait değil veya aktif değil.");
        var employeeIds = planRequests.Where(plan => plan.EmployeeAccountId.HasValue).Select(plan => plan.EmployeeAccountId!.Value).Distinct().ToArray();
        if (employeeIds.Length > 0 && await dbContext.CompanyMemberships.CountAsync(item => employeeIds.Contains(item.AccountId) && item.IsActive && item.Account.IsActive && item.Account.Portal == PortalType.Employee, cancellationToken) != employeeIds.Length)
            return Validation("servicePlans", "Hizmet planındaki personellerden biri aktif değil.");
        var contract = new CustomerContract
        {
            Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, CustomerId = proposal.CustomerId, CustomerBranchId = proposal.CustomerBranchId,
            CommercialProposalId = proposal.Id, CreatedByAccountId = context.AccountId.Value,
            Number = await NextNumberAsync(dbContext.CustomerContracts.Select(value => value.Number), "SZL", cancellationToken), Title = proposal.Title,
            Status = "Active", StartDate = request.StartDate, EndDate = request.EndDate, BillingFrequency = request.BillingFrequency,
            BillingDay = Math.Clamp(request.BillingDay, 1, 28), PaymentTermDays = Math.Clamp(request.PaymentTermDays, 0, 180),
            PeriodAmount = request.PeriodAmount ?? proposal.TotalAmount, Currency = proposal.Currency, Scope = Clean(request.Scope), Terms = Clean(request.Terms),
            AutoRenew = request.AutoRenew, RenewalNoticeDays = request.RenewalNoticeDays, AnnualPriceIncreaseRate = request.AnnualPriceIncreaseRate,
            FreeEmergencyCallsPerYear = request.FreeEmergencyCallsPerYear, ExtraEmergencyCallPrice = request.ExtraEmergencyCallPrice, ResponseTimeHours = request.ResponseTimeHours
        };
        contract.ServicePlans = planRequests.Select(plan => new ContractServicePlan
        {
            Id = Guid.NewGuid(), CompanyId = contract.CompanyId, CustomerContractId = contract.Id, CustomerId = contract.CustomerId,
            CustomerBranchId = plan.BranchId, AssignedEmployeeAccountId = plan.EmployeeAccountId, ServiceType = plan.ServiceType.Trim(),
            RecurrenceType = plan.RecurrenceType, VisitsPerPeriod = plan.VisitsPerPeriod, PreferredDay = plan.PreferredDay,
            PreferredTime = plan.PreferredTime, DurationMinutes = plan.DurationMinutes, BranchPrice = plan.BranchPrice
        }).ToList();
        if (request.BillingFrequency != "Manual")
        {
            var dates = BillingDates(contract.StartDate, contract.EndDate, contract.BillingFrequency, contract.BillingDay).Take(120).ToArray();
            var index = 0;
            foreach (var issueDate in dates)
            {
                index++;
                contract.Receivables.Add(new ReceivableEntry
                {
                    Id = Guid.NewGuid(), CompanyId = contract.CompanyId, CustomerId = contract.CustomerId, CustomerBranchId = contract.CustomerBranchId,
                    CustomerContractId = contract.Id, Number = $"{contract.Number}-{index:000}", Description = $"{contract.Title} / {index}. dönem",
                    IssueDate = issueDate, DueDate = issueDate.AddDays(contract.PaymentTermDays), Amount = contract.PeriodAmount, Currency = contract.Currency, Status = "Planned"
                });
            }
        }
        proposal.Status = "Converted";
        proposal.UpdatedAt = DateTimeOffset.UtcNow;
        dbContext.CustomerContracts.Add(contract);
        await dbContext.SaveChangesAsync(cancellationToken);
        await GenerateForContractAsync(contract, Min(contract.EndDate, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(90))), dbContext, context.AccountId.Value, cancellationToken);
        dbContext.ChangeTracker.Clear();
        var savedContract = await ContractQuery(dbContext).SingleAsync(item => item.Id == contract.Id, cancellationToken);
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(value => value.Id == context.CompanyId.Value, cancellationToken);
        var contractPdf = CommercialPdfRenderer.Contract(savedContract, company);
        dbContext.QualityDocuments.Add(NewCommercialDocument(contract.CompanyId, contract.CustomerId, contract.CustomerBranchId, contract.CreatedByAccountId, "Contracts", $"{contract.Number} · {contract.Title}", $"{contract.Number}.pdf", contractPdf));
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.Created($"/api/company/commercial/contracts/{contract.Id}", ToContract(savedContract));
    }

    private static async Task<IResult> GetContractsAsync(PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        Results.Ok((await ContractQuery(dbContext).ToListAsync(cancellationToken)).OrderByDescending(item => item.CreatedAt).Select(ToContract));

    private static async Task<IResult> GenerateContractWorkOrdersAsync(Guid contractId, GenerateContractWorkOrdersRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var contract = await dbContext.CustomerContracts.Include(item => item.ServicePlans).SingleOrDefaultAsync(item => item.Id == contractId && item.Status == "Active", cancellationToken);
        if (contract is null) return Results.NotFound();
        var through = Min(contract.EndDate, request.ThroughDate ?? DateOnly.FromDateTime(DateTime.UtcNow.AddDays(90)));
        return Results.Ok(await GenerateForContractAsync(contract, through, dbContext, context.AccountId.Value, cancellationToken));
    }

    private static async Task<IResult> RenewContractAsync(Guid contractId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.AccountId.HasValue) return Results.Forbid();
        var contract = await dbContext.CustomerContracts.Include(item => item.ServicePlans).SingleOrDefaultAsync(item => item.Id == contractId && item.Status == "Active", cancellationToken);
        if (contract is null) return Results.NotFound();
        if (!contract.AutoRenew) return Validation("autoRenew", "Bu sözleşmede otomatik yenileme etkin değil.");
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (contract.EndDate.DayNumber - today.DayNumber > contract.RenewalNoticeDays)
            return Validation("renewal", $"Bu sözleşme yenileme dönemine henüz girmedi. Yenileme, bitişten {contract.RenewalNoticeDays} gün önce açılır.");
        var oldEnd = contract.EndDate;
        contract.EndDate = contract.EndDate.AddYears(1);
        contract.PeriodAmount = decimal.Round(contract.PeriodAmount * (1 + contract.AnnualPriceIncreaseRate / 100m), 2);
        contract.LastRenewedAt = DateTimeOffset.UtcNow; contract.UpdatedAt = DateTimeOffset.UtcNow;
        foreach (var plan in contract.ServicePlans) plan.BranchPrice = decimal.Round(plan.BranchPrice * (1 + contract.AnnualPriceIncreaseRate / 100m), 2);
        if (contract.BillingFrequency != "Manual")
        {
            var index = await dbContext.ReceivableEntries.CountAsync(item => item.CustomerContractId == contract.Id, cancellationToken);
            foreach (var issueDate in BillingDates(oldEnd.AddDays(1), contract.EndDate, contract.BillingFrequency, contract.BillingDay).Take(120))
            {
                index++;
                dbContext.ReceivableEntries.Add(new ReceivableEntry { Id = Guid.NewGuid(), CompanyId = contract.CompanyId, CustomerId = contract.CustomerId, CustomerBranchId = contract.CustomerBranchId, CustomerContractId = contract.Id, Number = $"{contract.Number}-{index:000}", Description = $"{contract.Title} / yenileme dönemi", IssueDate = issueDate, DueDate = issueDate.AddDays(contract.PaymentTermDays), Amount = contract.PeriodAmount, Currency = contract.Currency, Status = "Planned" });
            }
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        await GenerateForContractAsync(contract, Min(contract.EndDate, DateOnly.FromDateTime(DateTime.UtcNow.AddDays(90))), dbContext, context.AccountId.Value, cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToContract(await ContractQuery(dbContext).SingleAsync(item => item.Id == contract.Id, cancellationToken)));
    }

    private static async Task<IResult> GetReceivablesAsync(PesneerDbContext dbContext, CancellationToken cancellationToken) =>
        Results.Ok((await ReceivableQuery(dbContext).ToListAsync(cancellationToken)).OrderBy(item => item.DueDate).Select(ToReceivable));

    private static async Task<IResult> RecordPaymentAsync(Guid receivableId, RecordPaymentRequest request, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        if (request.Amount <= 0) return Validation("amount", "Ödeme tutarı sıfırdan büyük olmalıdır.");
        var item = await dbContext.ReceivableEntries.SingleOrDefaultAsync(value => value.Id == receivableId, cancellationToken);
        if (item is null) return Results.NotFound();
        item.PaidAmount = Math.Min(item.Amount, item.PaidAmount + request.Amount);
        item.PaidAt = DateTimeOffset.UtcNow;
        item.PaymentNote = Clean(request.Note);
        item.Status = item.PaidAmount >= item.Amount ? "Paid" : "Partial";
        await dbContext.SaveChangesAsync(cancellationToken);
        dbContext.ChangeTracker.Clear();
        return Results.Ok(ToReceivable(await ReceivableQuery(dbContext).SingleAsync(value => value.Id == receivableId, cancellationToken)));
    }

    private static async Task<IResult> SaveEconomicsAsync(Guid workOrderId, WorkOrderEconomicsRequest request, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        if (!context.CompanyId.HasValue || new[] { request.Revenue, request.PersonnelHourlyCost, request.DistanceKm, request.FuelCost, request.RepeatVisitCost, request.EmergencyCallCost, request.OtherCost }.Any(value => value < 0))
            return Validation("economics", "Maliyet ve gelir değerleri negatif olamaz.");
        if (!await dbContext.WorkOrders.AnyAsync(item => item.Id == workOrderId, cancellationToken)) return Results.NotFound();
        var item = await dbContext.WorkOrderEconomics.SingleOrDefaultAsync(value => value.WorkOrderId == workOrderId, cancellationToken);
        if (item is null)
        {
            item = new WorkOrderEconomics { Id = Guid.NewGuid(), CompanyId = context.CompanyId.Value, WorkOrderId = workOrderId };
            dbContext.WorkOrderEconomics.Add(item);
        }
        item.Revenue = request.Revenue; item.PersonnelHourlyCost = request.PersonnelHourlyCost; item.DistanceKm = request.DistanceKm;
        item.FuelCost = request.FuelCost; item.RepeatVisitCost = request.RepeatVisitCost; item.EmergencyCallCost = request.EmergencyCallCost; item.OtherCost = request.OtherCost; item.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> GetProfitabilityAsync(DateOnly? start, DateOnly? end, PesneerDbContext dbContext, CancellationToken cancellationToken)
    {
        var startDate = start ?? DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3));
        var endDate = end ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var from = new DateTimeOffset(startDate.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var until = new DateTimeOffset(endDate.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
        var completedOrders = await dbContext.WorkOrders.AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch)
            .Where(item => item.Status == "Completed").ToListAsync(cancellationToken);
        var orders = completedOrders.Where(item => item.ScheduledAt >= from && item.ScheduledAt < until).ToList();
        var economics = await dbContext.WorkOrderEconomics.AsNoTracking().Where(item => orders.Select(order => order.Id).Contains(item.WorkOrderId)).ToDictionaryAsync(item => item.WorkOrderId, cancellationToken);
        var reports = await dbContext.ServiceReports.AsNoTracking().Include(item => item.Products).ThenInclude(item => item.VehicleStockItem).ThenInclude(item => item!.InventoryItem)
            .Where(item => orders.Select(order => order.Id).Contains(item.WorkOrderId)).ToListAsync(cancellationToken);
        var productCosts = reports.ToDictionary(report => report.WorkOrderId, report => report.Products.Sum(product => product.AmountUsed * (product.VehicleStockItem?.InventoryItem?.UnitCost ?? 0)));
        var receivables = await dbContext.ReceivableEntries.AsNoTracking().ToListAsync(cancellationToken);
        var contracts = await dbContext.CustomerContracts.AsNoTracking().ToListAsync(cancellationToken);
        var rows = orders.GroupBy(item => new { item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, BranchName = item.CustomerBranch != null ? item.CustomerBranch.Name : "Merkez / Genel" }).Select(group =>
        {
            decimal revenue = 0, product = 0, personnel = 0, fuel = 0, repeat = 0, emergency = 0, other = 0;
            foreach (var order in group)
            {
                economics.TryGetValue(order.Id, out var eco);
                revenue += eco?.Revenue ?? 0; product += productCosts.GetValueOrDefault(order.Id);
                personnel += (eco?.PersonnelHourlyCost ?? 0) * order.DurationMinutes / 60m;
                fuel += eco?.FuelCost ?? 0; repeat += eco?.RepeatVisitCost ?? 0; emergency += eco?.EmergencyCallCost ?? 0; other += eco?.OtherCost ?? 0;
            }
            var customerReceivables = receivables.Where(item => item.CustomerId == group.Key.CustomerId && (!group.Key.CustomerBranchId.HasValue || item.CustomerBranchId == group.Key.CustomerBranchId)).ToArray();
            var balance = customerReceivables.Sum(item => item.Amount - item.PaidAmount);
            var totalCost = product + personnel + fuel + repeat + emergency + other;
            var profit = revenue - totalCost;
            var activeContract = contracts.Where(item => item.CustomerId == group.Key.CustomerId && item.Status == "Active").OrderByDescending(item => item.EndDate).FirstOrDefault();
            var overdue = customerReceivables.Count(item => item.Status != "Paid" && item.DueDate < DateOnly.FromDateTime(DateTime.UtcNow));
            var renewalScore = activeContract is null ? 25 : Math.Clamp(85 - overdue * 12 - (profit < 0 ? 20 : 0), 5, 95);
            return new ProfitabilityRowResponse(group.Key.CustomerId, group.Key.LegalName, group.Key.CustomerBranchId, group.Key.BranchName, revenue, product, personnel, fuel, repeat, emergency, other, profit, revenue == 0 ? 0 : decimal.Round(profit / revenue * 100, 1), balance, group.Count(), group.Count(item => economics.GetValueOrDefault(item.Id)?.RepeatVisitCost > 0), group.Count(item => economics.GetValueOrDefault(item.Id)?.EmergencyCallCost > 0), renewalScore);
        }).OrderByDescending(item => item.Revenue).ToArray();
        var totalRevenue = rows.Sum(item => item.Revenue); var grossProfit = rows.Sum(item => item.GrossProfit); var totalReceivable = receivables.Sum(item => item.Amount); var paid = receivables.Sum(item => item.PaidAmount);
        return Results.Ok(new ProfitabilitySummaryResponse(totalRevenue, totalRevenue - grossProfit, grossProfit, totalRevenue == 0 ? 0 : decimal.Round(grossProfit / totalRevenue * 100, 1), totalReceivable - paid, totalReceivable == 0 ? 100 : decimal.Round(paid / totalReceivable * 100, 1), contracts.Count(item => item.Status == "Active" && item.EndDate >= DateOnly.FromDateTime(DateTime.UtcNow) && item.EndDate <= DateOnly.FromDateTime(DateTime.UtcNow.AddDays(90))), rows));
    }

    private static async Task<IResult> GetProposalPdfAsync(Guid proposalId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var proposal = await ProposalQuery(dbContext).SingleOrDefaultAsync(item => item.Id == proposalId, cancellationToken);
        if (proposal is null) return Results.NotFound();
        if (!context.CompanyId.HasValue) return Results.Forbid();
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(value => value.Id == context.CompanyId.Value, cancellationToken);
        return Results.File(CommercialPdfRenderer.Proposal(proposal, company), "application/pdf", $"{proposal.Number}.pdf");
    }

    private static async Task<IResult> GetContractPdfAsync(Guid contractId, PesneerDbContext dbContext, ICompanyContext context, CancellationToken cancellationToken)
    {
        var contract = await ContractQuery(dbContext).SingleOrDefaultAsync(item => item.Id == contractId, cancellationToken);
        if (contract is null) return Results.NotFound();
        if (!context.CompanyId.HasValue) return Results.Forbid();
        var company = await dbContext.Companies.AsNoTracking().SingleAsync(value => value.Id == context.CompanyId.Value, cancellationToken);
        return Results.File(CommercialPdfRenderer.Contract(contract, company), "application/pdf", $"{contract.Number}.pdf");
    }

    private static async Task<ContractGenerationResponse> GenerateForContractAsync(CustomerContract contract, DateOnly through, PesneerDbContext dbContext, Guid accountId, CancellationToken cancellationToken)
    {
        through = Min(through, contract.EndDate);
        if (through < contract.StartDate) return new ContractGenerationResponse(contract.Id, through, 0, 0);

        var plans = contract.ServicePlans.Where(item => item.IsActive).ToArray();
        if (plans.Length == 0) return new ContractGenerationResponse(contract.Id, through, 0, 0);

        var planIds = plans.Select(item => item.Id).ToArray();
        var existingOrders = await dbContext.WorkOrders.AsNoTracking()
            .Where(item => item.ContractServicePlanId.HasValue && planIds.Contains(item.ContractServicePlanId.Value))
            .Select(item => new { item.ContractServicePlanId, item.ScheduledAt, item.Number })
            .ToListAsync(cancellationToken);
        var existingKeys = existingOrders
            .Select(item => $"{item.ContractServicePlanId}:{DateOnly.FromDateTime(item.ScheduledAt.DateTime):yyyyMMdd}")
            .ToHashSet(StringComparer.Ordinal);
        var allNumbers = await dbContext.WorkOrders.AsNoTracking().Select(item => item.Number).ToListAsync(cancellationToken);
        var counters = new Dictionary<string, int>(StringComparer.Ordinal);
        var created = 0;
        var skipped = 0;

        foreach (var plan in plans)
        {
            foreach (var serviceDate in ServiceDates(plan, contract.StartDate, through))
            {
                var duplicateKey = $"{plan.Id}:{serviceDate:yyyyMMdd}";
                if (!existingKeys.Add(duplicateKey))
                {
                    skipped++;
                    continue;
                }

                var prefix = $"IE-{serviceDate:yyMMdd}-";
                if (!counters.TryGetValue(prefix, out var sequence))
                {
                    sequence = allNumbers.Where(number => number.StartsWith(prefix, StringComparison.Ordinal))
                        .Select(number => int.TryParse(number[prefix.Length..], out var value) ? value : 0)
                        .DefaultIfEmpty().Max();
                }
                sequence++;
                counters[prefix] = sequence;

                var workOrder = new WorkOrder
                {
                    Id = Guid.NewGuid(), CompanyId = contract.CompanyId, CustomerId = contract.CustomerId,
                    CustomerBranchId = plan.CustomerBranchId, AssignedEmployeeAccountId = plan.AssignedEmployeeAccountId,
                    CustomerContractId = contract.Id, ContractServicePlanId = plan.Id, Number = $"{prefix}{sequence:000}",
                    ServiceType = plan.ServiceType, VisitType = "Routine", RecurrenceType = plan.RecurrenceType,
                    RecurrenceGroupId = contract.Id, ScheduledAt = ToIstanbulDateTime(serviceDate, plan.PreferredTime),
                    DurationMinutes = plan.DurationMinutes, Status = "Planned", ContractCoverage = "ContractIncluded", ChargeAmount = 0
                };
                workOrder.History.Add(new WorkOrderStatusHistory
                {
                    Id = Guid.NewGuid(), CompanyId = contract.CompanyId, WorkOrderId = workOrder.Id,
                    ChangedByAccountId = accountId, ToStatus = "Planned",
                    Note = $"{contract.Number} numaralı sözleşmenin hizmet planından otomatik oluşturuldu."
                });
                dbContext.WorkOrders.Add(workOrder);
                created++;
            }
            plan.GeneratedThrough = !plan.GeneratedThrough.HasValue || plan.GeneratedThrough < through ? through : plan.GeneratedThrough;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return new ContractGenerationResponse(contract.Id, through, created, skipped);
    }

    private static IEnumerable<DateOnly> ServiceDates(ContractServicePlan plan, DateOnly start, DateOnly end)
    {
        if (plan.RecurrenceType == "Manual") yield break;
        if (plan.RecurrenceType == "Weekly")
        {
            var first = start.AddDays((plan.PreferredDay - (int)start.DayOfWeek + 7) % 7);
            for (var week = first; week <= end; week = week.AddDays(7))
                for (var visit = 0; visit < plan.VisitsPerPeriod && week.AddDays(visit) <= end; visit++)
                    yield return week.AddDays(visit);
            yield break;
        }

        for (var month = new DateOnly(start.Year, start.Month, 1); month <= end; month = month.AddMonths(1))
        {
            var daysInMonth = DateTime.DaysInMonth(month.Year, month.Month);
            for (var visit = 0; visit < plan.VisitsPerPeriod; visit++)
            {
                var offset = plan.VisitsPerPeriod == 1 ? 0 : (int)Math.Round(visit * daysInMonth / (double)plan.VisitsPerPeriod);
                var day = Math.Clamp(plan.PreferredDay + offset, 1, daysInMonth);
                var date = new DateOnly(month.Year, month.Month, day);
                if (date >= start && date <= end) yield return date;
            }
        }
    }

    private static DateTimeOffset ToIstanbulDateTime(DateOnly date, string timeText)
    {
        var time = TimeOnly.ParseExact(timeText, ["HH:mm", "HH:mm:ss"], CultureInfo.InvariantCulture, DateTimeStyles.None);
        TimeZoneInfo timeZone;
        try { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Istanbul"); }
        catch (TimeZoneNotFoundException) { timeZone = TimeZoneInfo.FindSystemTimeZoneById("Turkey Standard Time"); }
        var local = DateTime.SpecifyKind(date.ToDateTime(time), DateTimeKind.Unspecified);
        return new DateTimeOffset(local, timeZone.GetUtcOffset(local)).ToUniversalTime();
    }

    private static DateOnly Min(DateOnly left, DateOnly right) => left <= right ? left : right;

    private static IQueryable<CommercialProposal> ProposalQuery(PesneerDbContext dbContext) => dbContext.CommercialProposals.AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.Lines).AsSplitQuery();
    private static IQueryable<CustomerContract> ContractQuery(PesneerDbContext dbContext) => dbContext.CustomerContracts.AsNoTracking()
        .Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.Receivables)
        .Include(item => item.ServicePlans).ThenInclude(item => item.CustomerBranch)
        .Include(item => item.ServicePlans).ThenInclude(item => item.AssignedEmployeeAccount)
        .Include(item => item.ServicePlans).ThenInclude(item => item.WorkOrders).AsSplitQuery();
    private static IQueryable<ReceivableEntry> ReceivableQuery(PesneerDbContext dbContext) => dbContext.ReceivableEntries.AsNoTracking().Include(item => item.Customer).Include(item => item.CustomerBranch).Include(item => item.CustomerContract);
    private static ProposalResponse ToProposal(CommercialProposal item) => new(item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel", item.Title, item.Status, item.IssueDate, item.ValidUntil, item.Currency, item.Subtotal, item.DiscountAmount, item.VatRate, item.VatAmount, item.TotalAmount, item.Notes, item.Terms, item.CustomerDecisionAt, item.CustomerDecisionNote, item.CreatedAt, item.Lines.OrderBy(line => line.SortOrder).Select(line => new ProposalLineResponse(line.Id, line.Description, line.Quantity, line.Unit, line.UnitPrice, line.LineTotal)).ToArray());
    private static ContractResponse ToContract(CustomerContract item)
    {
        var daysUntilEnd = item.EndDate.DayNumber - DateOnly.FromDateTime(DateTime.UtcNow).DayNumber;
        var plans = item.ServicePlans.OrderBy(plan => plan.CustomerBranch?.Name).ThenBy(plan => plan.ServiceType)
            .Select(plan => new ContractServicePlanResponse(plan.Id, plan.CustomerBranchId, plan.CustomerBranch?.Name ?? "Merkez / Genel", plan.AssignedEmployeeAccountId, plan.AssignedEmployeeAccount?.DisplayName ?? "Atama bekliyor", plan.ServiceType, plan.RecurrenceType, plan.VisitsPerPeriod, plan.PreferredDay, plan.PreferredTime, plan.DurationMinutes, plan.BranchPrice, plan.GeneratedThrough, plan.IsActive, plan.WorkOrders.Count)).ToArray();
        return new ContractResponse(item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel", item.CommercialProposalId, item.Title, item.Status, item.StartDate, item.EndDate, item.BillingFrequency, item.BillingDay, item.PaymentTermDays, item.PeriodAmount, item.Currency, item.Scope, item.Terms, item.AutoRenew, item.RenewalNoticeDays, item.AnnualPriceIncreaseRate, item.FreeEmergencyCallsPerYear, item.ExtraEmergencyCallPrice, item.ResponseTimeHours, daysUntilEnd, item.Status == "Active" && daysUntilEnd <= item.RenewalNoticeDays, item.Receivables.Count, item.Receivables.Sum(value => value.Amount - value.PaidAmount), plans.Sum(plan => plan.GeneratedWorkOrderCount), item.CreatedAt, plans);
    }
    private static ReceivableResponse ToReceivable(ReceivableEntry item) { var status = item.Status == "Paid" ? "Paid" : item.DueDate < DateOnly.FromDateTime(DateTime.UtcNow) ? "Overdue" : item.Status; return new(item.Id, item.Number, item.CustomerId, item.Customer.LegalName, item.CustomerBranchId, item.CustomerBranch?.Name ?? "Merkez / Genel", item.CustomerContractId, item.CustomerContract?.Number ?? "—", item.Description, item.IssueDate, item.DueDate, item.Amount, item.PaidAmount, item.Amount - item.PaidAmount, item.Currency, status, item.PaidAt, item.PaymentNote); }
    private static IEnumerable<DateOnly> BillingDates(DateOnly start, DateOnly end, string frequency, int day) { var current = new DateOnly(start.Year, start.Month, Math.Min(day, DateTime.DaysInMonth(start.Year, start.Month))); if (current < start) current = current.AddMonths(1); var months = frequency switch { "Quarterly" => 3, "SemiAnnual" => 6, "Annual" => 12, _ => 1 }; while (current <= end) { yield return current; current = frequency == "Weekly" ? current.AddDays(7) : current.AddMonths(months); } }
    private static async Task<string> NextNumberAsync(IQueryable<string> query, string prefix, CancellationToken cancellationToken) { var year = DateTime.UtcNow.Year; var start = $"{prefix}-{year}-"; var values = await query.Where(value => value.StartsWith(start)).ToListAsync(cancellationToken); var next = values.Select(value => int.TryParse(value[start.Length..], out var number) ? number : 0).DefaultIfEmpty().Max() + 1; return $"{start}{next:0000}"; }
    private static QualityDocument NewCommercialDocument(Guid companyId, Guid customerId, Guid? branchId, Guid accountId, string category, string title, string fileName, byte[] pdf) => new() { Id = Guid.NewGuid(), CompanyId = companyId, CustomerId = customerId, CustomerBranchId = branchId, CreatedByAccountId = accountId, Category = category, Title = title, Description = "Ticari yönetim modülünde otomatik oluşturuldu.", FileName = fileName, ContentType = "application/pdf", SizeBytes = pdf.LongLength, FileData = pdf };
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static IResult Validation(string key, string message) => Results.ValidationProblem(new Dictionary<string, string[]> { [key] = [message] });
}
