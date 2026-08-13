using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public sealed class PostgresPesneerDbContextFactory : IDesignTimeDbContextFactory<PostgresPesneerDbContext>
{
    public PostgresPesneerDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<PostgresPesneerDbContext>()
            .UseNpgsql("Host=localhost;Database=pesneer_migrations;Username=postgres;Password=postgres")
            .Options;
        return new PostgresPesneerDbContext(options, EmptyCompanyContext.Instance);
    }

    private sealed class EmptyCompanyContext : ICompanyContext
    {
        public static EmptyCompanyContext Instance { get; } = new();
        public Guid? AccountId => null;
        public Guid? CompanyId => null;
        public Guid? CustomerId => null;
        public Guid? CustomerBranchId => null;
        public PortalType? Portal => null;
    }
}
