using System;
using System.Threading.Tasks;
using Npgsql;

namespace DbMigrator;

class Program
{
    static async Task Main()
    {
        var connStr = "Host=aws-0-eu-central-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.sjykqpkmtwxouuhpxvgr;Password=4354e643a83C9.;SSL Mode=Require;";
        await using var conn = new NpgsqlConnection(connStr);
        await conn.OpenAsync();

        Console.WriteLine("=== MÜŞTERİ HESAPLARI (PORTAL: CUSTOMER) ===");
        await using (var cmd = new NpgsqlCommand(@"
            SELECT c.""Code"" as ServiceProviderCode, cust.""LegalName"" as CustomerName, a.""Email"", a.""DisplayName""
            FROM ""CustomerMemberships"" cm
            JOIN ""Customers"" cust ON cm.""CustomerId"" = cust.""Id""
            JOIN ""Companies"" c ON cust.""CompanyId"" = c.""Id""
            JOIN ""Accounts"" a ON cm.""AccountId"" = a.""Id"";", conn))
        await using (var r = await cmd.ExecuteReaderAsync())
        {
            while (await r.ReadAsync())
            {
                Console.WriteLine($" - Hizmet Sağlayıcı: '{r["ServiceProviderCode"]}' | Müşteri: '{r["CustomerName"]}' | E-posta: '{r["Email"]}' | Ad Soyad: '{r["DisplayName"]}'");
            }
        }
    }
}
