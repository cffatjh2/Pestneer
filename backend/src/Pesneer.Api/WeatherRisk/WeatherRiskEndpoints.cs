using Microsoft.EntityFrameworkCore;
using Pesneer.Api.Data;

namespace Pesneer.Api.WeatherRisk;

public static class WeatherRiskEndpoints
{
    public static IEndpointRouteBuilder MapWeatherRiskEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/company/weather-risks", GetCompanyAsync).RequireAuthorization("OwnerPortal");
        app.MapGet("/api/customer/portal/weather-risks", GetCustomerAsync).RequireAuthorization("CustomerPortal");
        return app;
    }

    private static async Task<IResult> GetCompanyAsync(bool? forceRefresh, PesneerDbContext dbContext, IWeatherRiskService service, CancellationToken cancellationToken)
    {
        var customers = await dbContext.Customers.AsNoTracking().Include(item => item.Branches).Where(item => item.IsActive).AsSplitQuery().ToListAsync(cancellationToken);
        return Results.Ok(await service.BuildAsync(ToLocations(customers, null), forceRefresh == true, cancellationToken));
    }

    private static async Task<IResult> GetCustomerAsync(bool? forceRefresh, PesneerDbContext dbContext, ICompanyContext context, IWeatherRiskService service, CancellationToken cancellationToken)
    {
        if (!context.CustomerId.HasValue) return Results.Forbid();
        var customers = await dbContext.Customers.AsNoTracking().Include(item => item.Branches)
            .Where(item => item.Id == context.CustomerId.Value && item.IsActive).AsSplitQuery().ToListAsync(cancellationToken);
        return Results.Ok(await service.BuildAsync(ToLocations(customers, context.CustomerBranchId), forceRefresh == true, cancellationToken));
    }

    private static WeatherRiskLocation[] ToLocations(IReadOnlyList<Domain.Customer> customers, Guid? branchScope)
    {
        var locations = new List<WeatherRiskLocation>();
        foreach (var customer in customers)
        {
            if (!branchScope.HasValue && (customer.Latitude.HasValue || customer.Longitude.HasValue || !string.IsNullOrWhiteSpace(customer.MapUrl)))
            {
                locations.Add(new WeatherRiskLocation(customer.Id, customer.LegalName, null, "Merkez", customer.Address ?? customer.City ?? "Adres girilmedi", customer.MapUrl, customer.Latitude, customer.Longitude, "Customer"));
            }

            locations.AddRange(customer.Branches
                .Where(branch => branch.IsActive && (!branchScope.HasValue || branch.Id == branchScope.Value))
                .Select(branch => new WeatherRiskLocation(customer.Id, customer.LegalName, branch.Id, branch.Name, branch.Address, branch.MapUrl, branch.Latitude, branch.Longitude, "Branch")));
        }

        return locations.ToArray();
    }
}
