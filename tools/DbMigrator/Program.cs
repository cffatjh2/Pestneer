using System;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading.Tasks;
using Npgsql;

class Program
{
    static async Task Main()
    {
        var renderConnStr = "Host=dpg-d9qgegrm8hqs738drq50-a.frankfurt-postgres.render.com;Port=5432;Database=pesneer;Username=pesneer;Password=lTDqWSyV0PUX8b1rmNjlNdcjQaRcSpbh;SSL Mode=Require;Timeout=60;Command Timeout=180;";
        var supabaseConnStr = "Host=aws-0-eu-central-1.pooler.supabase.com;Port=5432;Database=postgres;Username=postgres.sjykqpkmtwxouuhpxvgr;Password=4354e643a83C9.;SSL Mode=Require;Timeout=60;Command Timeout=180;";

        Console.WriteLine("=== PESNEER COMPLETE MIGRATION (HIGH TIMEOUT) ===");

        await using var renderConn = new NpgsqlConnection(renderConnStr);
        await renderConn.OpenAsync();

        await using var supabaseConn = new NpgsqlConnection(supabaseConnStr);
        await supabaseConn.OpenAsync();

        // 1. Get all table names
        var tables = new List<string>();
        await using (var cmd = new NpgsqlCommand("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name != '__EFMigrationsHistory' ORDER BY table_name;", renderConn))
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            while (await reader.ReadAsync()) tables.Add(reader.GetString(0));
        }

        Console.WriteLine($"Found {tables.Count} tables to transfer.");

        // 2. Disable replication triggers on Supabase
        try
        {
            await using var disableCmd = new NpgsqlCommand("SET session_replication_role = replica;", supabaseConn);
            await disableCmd.ExecuteNonQueryAsync();
        }
        catch { }

        // 3. Truncate all tables ONCE at the start
        Console.WriteLine("Cleaning Supabase tables once before loading...");
        foreach (var t in tables)
        {
            try
            {
                await using var truncCmd = new NpgsqlCommand($"TRUNCATE TABLE \"{t}\" CASCADE;", supabaseConn);
                await truncCmd.ExecuteNonQueryAsync();
            }
            catch { }
        }

        // 4. Copy each table
        var totalCopied = 0L;
        foreach (var table in tables)
        {
            var cols = await GetCommonColumnsAsync(renderConn, supabaseConn, table);
            if (cols.Count == 0) continue;

            var colList = string.Join(", ", cols.Select(c => $"\"{c}\""));

            // Read source rows
            await using var selectCmd = new NpgsqlCommand($"SELECT {colList} FROM \"{table}\";", renderConn)
            {
                CommandTimeout = 180
            };
            await using var reader = await selectCmd.ExecuteReaderAsync();

            var rows = new List<object[]>();
            while (await reader.ReadAsync())
            {
                var values = new object[cols.Count];
                reader.GetValues(values);
                rows.Add(values);
            }
            await reader.CloseAsync();

            if (rows.Count == 0)
            {
                Console.WriteLine($" - {table}: 0 rows");
                continue;
            }

            // Use 1 row per insert for heavy tables, 25 for light tables
            var isHeavy = table.Contains("Document", StringComparison.OrdinalIgnoreCase) || 
                          table.Contains("Photo", StringComparison.OrdinalIgnoreCase) ||
                          table.Contains("SitePlan", StringComparison.OrdinalIgnoreCase);
            var batchSize = isHeavy ? 1 : 25;

            for (int i = 0; i < rows.Count; i += batchSize)
            {
                var chunk = rows.Skip(i).Take(batchSize).ToList();
                var placeholders = new List<string>();
                await using var insertCmd = supabaseConn.CreateCommand();
                insertCmd.CommandTimeout = 180;

                for (int r = 0; r < chunk.Count; r++)
                {
                    var rowPlaceholders = new List<string>();
                    for (int c = 0; c < cols.Count; c++)
                    {
                        var pName = $"@p_{r}_{c}";
                        rowPlaceholders.Add(pName);
                        insertCmd.Parameters.AddWithValue(pName, chunk[r][c] ?? DBNull.Value);
                    }
                    placeholders.Add($"({string.Join(", ", rowPlaceholders)})");
                }

                insertCmd.CommandText = $"INSERT INTO \"{table}\" ({colList}) VALUES {string.Join(", ", placeholders)};";
                await insertCmd.ExecuteNonQueryAsync();
            }

            Console.WriteLine($" - {table}: {rows.Count} rows copied successfully.");
            totalCopied += rows.Count;
        }

        // 5. Re-enable replication triggers
        try
        {
            await using var enableCmd = new NpgsqlCommand("SET session_replication_role = DEFAULT;", supabaseConn);
            await enableCmd.ExecuteNonQueryAsync();
        }
        catch { }

        Console.WriteLine($"\n✅ COMPLETE! Total {totalCopied} records successfully migrated to Supabase!");

        // 6. Verification
        Console.WriteLine("\n=== FINAL VERIFICATION IN SUPABASE ===");
        var finalVerified = 0L;
        foreach (var table in tables)
        {
            await using var verifyCmd = new NpgsqlCommand($"SELECT COUNT(*) FROM \"{table}\";", supabaseConn);
            var count = Convert.ToInt64(await verifyCmd.ExecuteScalarAsync());
            if (count > 0)
            {
                Console.WriteLine($" ✔ {table}: {count} records");
                finalVerified += count;
            }
        }
        Console.WriteLine($"\n⭐ TOTAL VERIFIED SUPABASE ROWS: {finalVerified}");
    }

    private static async Task<List<string>> GetCommonColumnsAsync(NpgsqlConnection source, NpgsqlConnection target, string tableName)
    {
        var sourceCols = await GetColumnsAsync(source, tableName);
        var targetCols = await GetColumnsAsync(target, tableName);
        return sourceCols.Intersect(targetCols).ToList();
    }

    private static async Task<List<string>> GetColumnsAsync(NpgsqlConnection conn, string tableName)
    {
        await using var cmd = new NpgsqlCommand($@"
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = '{tableName}' 
            ORDER BY ordinal_position;", conn);

        var cols = new List<string>();
        try
        {
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync()) cols.Add(reader.GetString(0));
        }
        catch { }
        return cols;
    }
}
