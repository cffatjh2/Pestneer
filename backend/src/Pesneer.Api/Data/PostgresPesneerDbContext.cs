using Microsoft.EntityFrameworkCore;

namespace Pesneer.Api.Data;

public sealed class PostgresPesneerDbContext(
    DbContextOptions<PostgresPesneerDbContext> options,
    ICompanyContext companyContext) : PesneerDbContext(options, companyContext);
