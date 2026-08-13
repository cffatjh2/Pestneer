using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Data;

public sealed class PesneerDbContextFactory : IDesignTimeDbContextFactory<PesneerDbContext>
{
    public PesneerDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<PesneerDbContext>()
            .UseSqlite("Data Source=pesneer-migrations.db")
            .Options;
        return new PesneerDbContext(options, EmptyCompanyContext.Instance);
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
