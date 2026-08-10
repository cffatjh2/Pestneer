using System.Globalization;
using Pesneer.Api.Domain;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Pesneer.Api.Audits;

internal static class AuditPackageRenderer
{
    private const string Navy = "#102A43";
    private const string Blue = "#1769C2";
    private const string Green = "#10A37F";
    private const string Text = "#243B53";
    private const string Muted = "#627D98";
    private const string Border = "#D9E2EC";
    private const string Surface = "#F3F7FA";

    public static byte[] RenderPackage(string number, DateTimeOffset createdAt, AuditBuildSnapshot snapshot)
        => Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(8.5f).FontColor(Text));
                page.Header().Element(container => Header(container, snapshot.Company, "DENETİM KANIT DOSYASI", number));
                page.Content().PaddingVertical(15).Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Element(container => Cover(container, snapshot));
                    column.Item().Element(container => Readiness(container, snapshot.Preflight));
                    column.Item().Element(container => Scope(container, snapshot));
                    column.Item().Element(container => SectionSummary(container, snapshot.Preflight.Sections));
                    if (snapshot.Preflight.Issues.Count > 0)
                        column.Item().Element(container => Issues(container, snapshot.Preflight.Issues));
                    column.Item().Element(container => OperationalSummary(container, snapshot));
                    column.Item().Element(container => Manifest(container, snapshot.Evidence));
                    column.Item().BorderLeft(3).BorderColor(Green).Background("#EAF8F4").Padding(10)
                        .Text("Bu dosya oluşturulduğu anda kaynak kayıtların değiştirilemez anlık görüntülerini içerir. Her kanıtın SHA-256 özeti ZIP paketi içindeki manifest.json dosyasında yer alır.")
                        .FontSize(8).FontColor(Muted);
                });
                page.Footer().Element(container => Footer(container, number, createdAt));
            });
        }).GeneratePdf();

    public static byte[] RenderServiceReport(ServiceReport report, Company company)
        => Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(8.5f).FontColor(Text));
                page.Header().Element(container => Header(container, company, "SAHA UYGULAMA RAPORU", report.ReportNumber));
                page.Content().PaddingVertical(14).Column(column =>
                {
                    column.Spacing(10);
                    column.Item().Background(Surface).Padding(12).Column(hero =>
                    {
                        hero.Item().Text(report.WorkOrder.Customer.LegalName).FontSize(17).Bold().FontColor(Navy);
                        hero.Item().Text($"{report.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel"} · {report.WorkOrder.ServiceType} · {report.WorkOrder.ScheduledAt.ToOffset(TimeSpan.FromHours(3)):dd.MM.yyyy HH:mm}").FontColor(Muted);
                    });
                    column.Item().Element(container => KeyValues(container,
                        ("İş emri", report.WorkOrder.Number),
                        ("Durum", report.Status),
                        ("Hazırlayan", report.CreatedByAccount.DisplayName),
                        ("Doğrulama", report.VerificationCode),
                        ("Firma imzası", string.IsNullOrWhiteSpace(report.ManagerSignatureData) ? "Eksik" : "Mevcut"),
                        ("Müşteri imzası", string.IsNullOrWhiteSpace(report.CustomerSignatureData) ? "Eksik" : "Mevcut")));
                    Panel(column, "Uygulama özeti", report.ApplicationSummary);
                    Panel(column, "Bulgular", report.Findings);
                    Panel(column, "Düzeltici faaliyetler", report.CorrectiveActions);
                    Panel(column, "Öneriler", report.Recommendations);
                    if (report.Products.Count > 0)
                    {
                        column.Item().Text("KULLANILAN ÜRÜNLER").FontSize(8).Bold().FontColor(Blue);
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns => { columns.RelativeColumn(3); columns.RelativeColumn(); columns.RelativeColumn(2); });
                            TableHeader(table, "Ürün", "Miktar", "Uygulama / Aktif Madde");
                            foreach (var product in report.Products)
                                TableRow(table, product.ProductName, $"{product.AmountUsed:0.###} {product.Unit}", product.ApplicationMethod ?? product.ActiveIngredient ?? "-");
                        });
                    }
                    if (report.Stations.Count > 0)
                    {
                        column.Item().Text("İSTASYON KONTROLLERİ").FontSize(8).Bold().FontColor(Blue);
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns => { columns.RelativeColumn(); columns.RelativeColumn(2); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn(1.4f); });
                            TableHeader(table, "No", "Alan", "Durum", "Aktivite", "İşlem");
                            foreach (var station in report.Stations.OrderBy(item => item.DeviceNumber))
                                TableRow(table, station.DeviceNumber, station.Area, station.DeviceStatus, station.HasActivity ? $"Var ({station.CaughtCount})" : "Yok", station.AppliedProductName ?? station.ReplacementProductName ?? station.Notes ?? "-");
                        });
                    }
                });
                page.Footer().Element(container => Footer(container, report.ReportNumber, report.FinalizedAt ?? report.UpdatedAt));
            });
        }).GeneratePdf();

    private static void Cover(IContainer container, AuditBuildSnapshot snapshot)
    {
        var location = snapshot.Branch?.Name ?? "Merkez / Genel";
        container.Background("#EAF4FC").Padding(18).Row(row =>
        {
            row.RelativeItem().Column(column =>
            {
                column.Spacing(5);
                column.Item().Text(snapshot.Filter.AuditProfile).FontSize(8).Bold().FontColor(Green).LetterSpacing(.08f);
                column.Item().Text(snapshot.Customer.LegalName).FontSize(22).ExtraBold().FontColor(Navy);
                column.Item().Text(location).FontSize(12).SemiBold().FontColor(Blue);
                column.Item().Text($"Denetim dönemi: {snapshot.Filter.PeriodStart:dd.MM.yyyy} - {snapshot.Filter.PeriodEnd:dd.MM.yyyy}").FontColor(Muted);
            });
            row.ConstantItem(100).AlignRight().Column(column =>
            {
                column.Item().Text("KANIT").FontSize(7).Bold().FontColor(Muted);
                column.Item().Text(snapshot.Evidence.Count.ToString(CultureInfo.InvariantCulture)).FontSize(30).ExtraBold().FontColor(Blue);
                column.Item().Text("değiştirilemez kayıt").FontSize(7).FontColor(Muted);
            });
        });
    }

    private static void Readiness(IContainer container, AuditPreflightResponse preflight)
    {
        var color = preflight.BlockingIssueCount > 0 ? "#B54708" : Green;
        container.Border(1).BorderColor(Border).Padding(12).Row(row =>
        {
            row.ConstantItem(74).AlignCenter().Column(column =>
            {
                column.Item().AlignCenter().Text($"%{preflight.ReadinessScore}").FontSize(22).Bold().FontColor(color);
                column.Item().AlignCenter().Text("HAZIRLIK").FontSize(6.5f).Bold().FontColor(Muted);
            });
            row.RelativeItem().PaddingLeft(12).Column(column =>
            {
                column.Item().Text(preflight.Ready ? "Denetim paketi hazır" : "Eksikler görünür biçimde paketlendi").FontSize(12).Bold().FontColor(Navy);
                column.Item().PaddingTop(3).Text($"{preflight.BlockingIssueCount} kritik eksik · {preflight.WarningCount} uyarı · {preflight.EvidenceCount} kanıt").FontColor(Muted);
            });
        });
    }

    private static void Scope(IContainer container, AuditBuildSnapshot snapshot)
        => KeyValues(container,
            ("Standart / profil", snapshot.Filter.AuditProfile),
            ("Müşteri", snapshot.Customer.LegalName),
            ("Şube", snapshot.Branch?.Name ?? "Tüm şubeler / Merkez"),
            ("Dönem", $"{snapshot.Filter.PeriodStart:dd.MM.yyyy} - {snapshot.Filter.PeriodEnd:dd.MM.yyyy}"),
            ("Hazırlayan", snapshot.CreatedBy.DisplayName),
            ("Atık kayıtları", snapshot.Filter.IncludeOptionalWaste ? "Pakete dahil" : "Opsiyonel - dahil edilmedi"));

    private static void SectionSummary(IContainer container, IReadOnlyList<AuditSectionResponse> sections)
    {
        container.Column(column =>
        {
            column.Item().Text("İÇİNDEKİLER VE KAPSAM").FontSize(8).Bold().FontColor(Blue);
            column.Item().PaddingTop(6).Table(table =>
            {
                table.ColumnsDefinition(columns => { columns.ConstantColumn(34); columns.RelativeColumn(4); columns.RelativeColumn(); columns.RelativeColumn(); });
                TableHeader(table, "No", "Bölüm", "Kanıt", "Durum");
                var index = 1;
                foreach (var section in sections)
                    TableRow(table, index++.ToString("00", CultureInfo.InvariantCulture), section.Label, section.ItemCount.ToString(CultureInfo.InvariantCulture), SectionStatus(section.Status));
            });
        });
    }

    private static void Issues(IContainer container, IReadOnlyList<AuditPreflightIssueResponse> issues)
    {
        container.Column(column =>
        {
            column.Item().Text("ÖN KONTROL BULGULARI").FontSize(8).Bold().FontColor(Blue);
            foreach (var issue in issues)
            {
                var color = issue.Severity == "Blocking" ? "#B42318" : "#B54708";
                column.Item().PaddingTop(5).BorderLeft(3).BorderColor(color).Background(issue.Severity == "Blocking" ? "#FFF1F0" : "#FFF8EB").Padding(8).Column(panel =>
                {
                    panel.Item().Text(issue.Title).Bold().FontColor(color);
                    panel.Item().Text(issue.Detail).FontSize(7.5f).FontColor(Muted);
                    if (!string.IsNullOrWhiteSpace(issue.SuggestedAction)) panel.Item().Text($"Öneri: {issue.SuggestedAction}").FontSize(7.5f).Italic().FontColor(Text);
                });
            }
        });
    }

    private static void OperationalSummary(IContainer container, AuditBuildSnapshot snapshot)
    {
        var stations = snapshot.Reports.SelectMany(item => item.Stations).ToArray();
        container.Column(column =>
        {
            column.Item().Text("OPERASYON ÖZETİ").FontSize(8).Bold().FontColor(Blue);
            column.Item().PaddingTop(6).Row(row =>
            {
                Metric(row, "Sözleşme", snapshot.Contracts.Count);
                Metric(row, "Saha raporu", snapshot.Reports.Count);
                Metric(row, "İstasyon", stations.Length);
                Metric(row, "Aktivite", stations.Count(item => item.HasActivity));
                Metric(row, "Açık faaliyet", snapshot.CorrectiveActions.Count(item => item.Status is not "Verified" and not "Cancelled"));
            });
        });
    }

    private static void Manifest(IContainer container, IReadOnlyList<AuditEvidenceFile> evidence)
    {
        container.Column(column =>
        {
            column.Item().Text("KANIT MANİFESTOSU").FontSize(8).Bold().FontColor(Blue);
            column.Item().PaddingTop(6).Table(table =>
            {
                table.ColumnsDefinition(columns => { columns.RelativeColumn(1.4f); columns.RelativeColumn(2.4f); columns.RelativeColumn(1.2f); columns.RelativeColumn(1.2f); columns.RelativeColumn(1.8f); });
                TableHeader(table, "Bölüm", "Belge", "No / Revizyon", "Tarih", "SHA-256");
                foreach (var item in evidence.OrderBy(item => item.Section).ThenBy(item => item.SourceDate))
                    TableRow(table, item.SectionLabel, item.Title, $"{item.DocumentNumber}{(string.IsNullOrWhiteSpace(item.Revision) ? string.Empty : $" / {item.Revision}")}", item.SourceDate.ToOffset(TimeSpan.FromHours(3)).ToString("dd.MM.yyyy"), item.Sha256[..16] + "…");
            });
        });
    }

    private static void Header(IContainer container, Company company, string title, string number)
    {
        container.PaddingBottom(10).BorderBottom(2).BorderColor(Green).Row(row =>
        {
            row.ConstantItem(100).Height(48).AlignMiddle().Element(logo =>
            {
                if (company.LogoData is { Length: > 0 }) logo.Image(company.LogoData).FitArea();
                else logo.Text(company.LegalName).Bold().FontSize(10).FontColor(Navy);
            });
            row.RelativeItem().AlignCenter().AlignMiddle().Column(column =>
            {
                column.Item().AlignCenter().Text(title).FontSize(12).Bold().FontColor(Navy);
                column.Item().AlignCenter().Text(company.LegalName).FontSize(7).FontColor(Muted);
            });
            row.ConstantItem(112).AlignRight().AlignMiddle().Column(column =>
            {
                column.Item().Text(number).Bold().FontColor(Blue);
                column.Item().Text("Dijital kanıt paketi").FontSize(7).FontColor(Muted);
            });
        });
    }

    private static void KeyValues(IContainer container, params (string Label, string Value)[] values)
    {
        container.Table(table =>
        {
            table.ColumnsDefinition(columns => { columns.RelativeColumn(); columns.RelativeColumn(); });
            foreach (var value in values)
            {
                table.Cell().Border(1).BorderColor(Border).Padding(8).Column(column =>
                {
                    column.Item().Text(value.Label.ToUpperInvariant()).FontSize(6.5f).Bold().FontColor(Muted);
                    column.Item().PaddingTop(3).Text(value.Value).SemiBold().FontColor(Navy);
                });
            }
        });
    }

    private static void Panel(ColumnDescriptor column, string title, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        column.Item().Border(1).BorderColor(Border).Padding(9).Column(panel =>
        {
            panel.Item().Text(title.ToUpperInvariant()).FontSize(6.5f).Bold().FontColor(Muted);
            panel.Item().PaddingTop(4).Text(value).LineHeight(1.35f);
        });
    }

    private static void Metric(RowDescriptor row, string label, int value)
    {
        row.RelativeItem().PaddingHorizontal(2).Background(Surface).Padding(9).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(6).Bold().FontColor(Muted);
            column.Item().Text(value.ToString(CultureInfo.InvariantCulture)).FontSize(15).Bold().FontColor(Navy);
        });
    }

    private static void TableHeader(TableDescriptor table, params string[] values)
    {
        table.Header(header =>
        {
            foreach (var value in values)
                header.Cell().Background("#EAF2F8").BorderBottom(1).BorderColor(Border).PaddingVertical(6).PaddingHorizontal(4).Text(value).FontSize(6.5f).Bold().FontColor(Navy);
        });
    }

    private static void TableRow(TableDescriptor table, params string[] values)
    {
        foreach (var value in values)
            table.Cell().BorderBottom(1).BorderColor(Border).PaddingVertical(6).PaddingHorizontal(4).Text(string.IsNullOrWhiteSpace(value) ? "-" : value).FontSize(6.8f).FontColor(Text);
    }

    private static void Footer(IContainer container, string number, DateTimeOffset createdAt)
    {
        container.PaddingTop(8).BorderTop(1).BorderColor(Border).Row(row =>
        {
            row.RelativeItem().Text($"{number} · {createdAt.ToOffset(TimeSpan.FromHours(3)):dd.MM.yyyy HH:mm}").FontSize(7).FontColor(Muted);
            row.ConstantItem(90).AlignRight().Text(text =>
            {
                text.DefaultTextStyle(style => style.FontSize(7).FontColor(Muted));
                text.Span("Sayfa "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages();
            });
        });
    }

    private static string SectionStatus(string value) => value switch
    {
        "Complete" => "Tam",
        "Finding" => "Bulgu var",
        "Optional" => "Opsiyonel",
        _ => value
    };
}
