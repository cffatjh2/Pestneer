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

    public static byte[] RenderOfficialEk1Form(ServiceReport report, Company company)
        => Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(24);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(7.5f).FontColor(Text));
                page.Header().Element(container => Ek1Header(container, company, report));
                page.Content().PaddingVertical(6).Column(column =>
                {
                    column.Spacing(6);
                    column.Item().Element(container => Ek1MetaStrip(container, report));
                    column.Item().Element(container => Ek1FirmSection(container, report));
                    column.Item().Element(container => Ek1LocationSection(container, report));
                    column.Item().Element(container => Ek1ProductsSection(container, report));
                    column.Item().Element(container => Ek1StationsSection(container, report));
                    column.Item().Element(container => Ek1FindingsSection(container, report));
                    column.Item().Element(container => Ek1SignaturesSection(container, report));
                });
                page.Footer().Element(container => Ek1Footer(container, report));
            });
        }).GeneratePdf();

    public static byte[] RenderServiceReport(ServiceReport report, Company company)
        => Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(28);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(8.2f).FontColor(Text));
                page.Header().Element(container => Header(container, company, "SAHA UYGULAMA VE ANALİZ RAPORU", report.ReportNumber));
                page.Content().PaddingVertical(12).Column(column =>
                {
                    column.Spacing(9);
                    column.Item().Background(Surface).Padding(10).Column(hero =>
                    {
                        hero.Item().Text(report.WorkOrder.Customer.LegalName).FontSize(16).Bold().FontColor(Navy);
                        hero.Item().Text($"{report.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel"} · {report.WorkOrder.ServiceType} · {report.WorkOrder.ScheduledAt.ToOffset(TimeSpan.FromHours(3)):dd.MM.yyyy HH:mm}").FontColor(Muted);
                    });
                    column.Item().Element(container => KeyValues(container,
                        ("İş emri", report.WorkOrder.Number),
                        ("Durum", report.Status == "Finalized" ? "Onaylandı" : "Taslak"),
                        ("Hazırlayan", report.CreatedByAccount.DisplayName),
                        ("Doğrulama", report.VerificationCode),
                        ("Firma Onayı", string.IsNullOrWhiteSpace(report.ManagerSignatureData) ? "Bekleniyor" : "İmzalandı"),
                        ("Müşteri Onayı", string.IsNullOrWhiteSpace(report.CustomerSignatureData) ? "Bekleniyor" : "İmzalandı")));
                    Panel(column, "Uygulama özeti", report.ApplicationSummary);
                    Panel(column, "Saha bulguları", report.Findings);
                    Panel(column, "Düzeltici faaliyetler", report.CorrectiveActions);
                    Panel(column, "Öneriler", report.Recommendations);
                    if (report.Products.Count > 0)
                    {
                        column.Item().Text("KULLANILAN BİYOSİDAL ÜRÜNLER").FontSize(8).Bold().FontColor(Blue);
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
                        column.Item().Text("İSTASYON KONTROLLERİ VE BULGULAR").FontSize(8).Bold().FontColor(Blue);
                        column.Item().Table(table =>
                        {
                            table.ColumnsDefinition(columns => { columns.RelativeColumn(); columns.RelativeColumn(2); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn(1.4f); });
                            TableHeader(table, "No", "Alan", "Durum", "Aktivite", "İşlem");
                            foreach (var station in report.Stations.OrderBy(item => item.DeviceNumber))
                                TableRow(table, station.DeviceNumber, station.Area, station.DeviceStatus, station.HasActivity ? $"Var ({station.CaughtCount})" : "Yok", station.AppliedProductName ?? station.ReplacementProductName ?? station.Notes ?? "-");
                        });
                    }
                    column.Item().Element(container => Ek1SignaturesSection(container, report));
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

    private static void Ek1Header(IContainer container, Company company, ServiceReport report)
    {
        container.PaddingBottom(6).BorderBottom(2).BorderColor(Green).Row(row =>
        {
            row.ConstantItem(85).Height(40).AlignMiddle().Element(logo =>
            {
                if (company.LogoData is { Length: > 0 }) logo.Image(company.LogoData).FitArea();
                else logo.Text(report.FirmName).Bold().FontSize(8.5f).FontColor(Navy);
            });
            row.RelativeItem().AlignCenter().AlignMiddle().Column(column =>
            {
                column.Item().AlignCenter().Text("T.C. SAĞLIK BAKANLIĞI").FontSize(8).Bold().FontColor(Navy);
                column.Item().AlignCenter().Text("BİYOSİDAL ÜRÜN UYGULAMA İŞLEM FORMU (EK-1)").FontSize(10.5f).ExtraBold().FontColor(Navy);
                column.Item().AlignCenter().Text("Zararlı Mücadelesi Hizmet ve Saha Uygulama Belgesi").FontSize(6.5f).FontColor(Muted);
            });
            row.ConstantItem(100).AlignRight().AlignMiddle().Column(column =>
            {
                column.Item().Text(report.ReportNumber).Bold().FontSize(9).FontColor(Blue);
                column.Item().Text(report.Status == "Finalized" ? "ONAYLANDI" : "TASLAK").Bold().FontSize(7).FontColor(report.Status == "Finalized" ? Green : "#B54708");
            });
        });
    }

    private static void Ek1MetaStrip(IContainer container, ServiceReport report)
    {
        var scheduled = report.WorkOrder.ScheduledAt.ToOffset(TimeSpan.FromHours(3));
        var completed = (report.WorkOrder.CompletedAt ?? report.WorkOrder.ScheduledAt.AddHours(1)).ToOffset(TimeSpan.FromHours(3));
        container.Background("#EBF3FA").Border(1).BorderColor(Border).PaddingVertical(4).PaddingHorizontal(8).Row(row =>
        {
            row.RelativeItem().Text(t => { t.Span("İş Emri No: ").Bold().FontColor(Navy); t.Span(report.WorkOrder.Number); });
            row.RelativeItem().Text(t => { t.Span("Uygulama Tarihi: ").Bold().FontColor(Navy); t.Span(scheduled.ToString("dd.MM.yyyy")); });
            row.RelativeItem().Text(t => { t.Span("Saat: ").Bold().FontColor(Navy); t.Span($"{scheduled:HH:mm} - {completed:HH:mm}"); });
            row.RelativeItem().AlignRight().Text(t => { t.Span("Doğrulama: ").Bold().FontColor(Navy); t.Span(report.VerificationCode.Length >= 12 ? report.VerificationCode[..12].ToUpperInvariant() : report.VerificationCode); });
        });
    }

    private static void Ek1FirmSection(IContainer container, ServiceReport report)
    {
        container.Column(col =>
        {
            col.Item().Text("1. UYGULAMAYI YAPAN FİRMAYA AİT BİLGİLER").FontSize(7.5f).Bold().FontColor(Blue);
            col.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(cols => { cols.RelativeColumn(); cols.RelativeColumn(); });
                Ek1Cell(table, "Firma Unvanı", report.FirmName);
                Ek1Cell(table, "İzin Belge Tarih / No", report.PermissionNumber ?? "—");
                Ek1Cell(table, "Mesul Müdür", report.ResponsibleManager ?? "—");
                Ek1Cell(table, "Ekip Sorumlusu / Uygulayıcı", report.TeamManager ?? report.CreatedByAccount.DisplayName);
                Ek1Cell(table, "Firma Adresi", report.FirmAddress ?? "—");
                Ek1Cell(table, "İletişim", string.Join(" · ", new[] { report.FirmPhone, report.FirmWeb }.Where(s => !string.IsNullOrWhiteSpace(s))));
            });
        });
    }

    private static void Ek1LocationSection(IContainer container, ServiceReport report)
    {
        var location = report.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel";
        var address = report.WorkOrder.CustomerBranch?.Address ?? report.WorkOrder.Customer.Address ?? "—";
        var area = string.Join(" · ", new[] { report.ResidenceType, report.AreaSquareMeters > 0 ? $"{report.AreaSquareMeters:0.##} m²" : null }.Where(s => !string.IsNullOrWhiteSpace(s)));
        container.Column(col =>
        {
            col.Item().Text("2. UYGULAMA YAPILAN YERE AİT BİLGİLER").FontSize(7.5f).Bold().FontColor(Blue);
            col.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(cols => { cols.RelativeColumn(); cols.RelativeColumn(); });
                Ek1Cell(table, "Müşteri / Şube", $"{report.WorkOrder.Customer.LegalName} · {location}");
                Ek1Cell(table, "Uygulama Adresi", address);
                Ek1Cell(table, "Hedef Zararlı(lar)", report.TargetPests ?? "—");
                Ek1Cell(table, "Mahal / Alan", string.IsNullOrWhiteSpace(area) ? "—" : area);
                Ek1Cell(table, "İş / Hizmet Türü", report.WorkType ?? report.WorkOrder.ServiceType);
                Ek1Cell(table, "Güvenlik Önlemleri", report.SafetyMeasures ?? "Standart güvenlik önlemleri uygulandı");
            });
        });
    }

    private static void Ek1ProductsSection(IContainer container, ServiceReport report)
    {
        container.Column(col =>
        {
            col.Item().Text("3. KULLANILAN BİYOSİDAL ÜRÜNLER").FontSize(7.5f).Bold().FontColor(Blue);
            col.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(cols =>
                {
                    cols.RelativeColumn(2.5f);
                    cols.RelativeColumn(1.8f);
                    cols.RelativeColumn(2.2f);
                    cols.RelativeColumn(2.0f);
                    cols.RelativeColumn(1.5f);
                    cols.RelativeColumn(1.5f);
                });
                TableHeader(table, "Ürün Ticari Adı", "Ruhsat No / Tarih", "Etken Madde", "Uygulama Yöntemi", "Seyreltme", "Miktar");
                if (report.Products.Count == 0)
                {
                    table.Cell().ColumnSpan(6).BorderBottom(1).BorderColor(Border).Padding(5).AlignCenter().Text("Kullanılan biyosidal ürün bulunmuyor.").FontSize(7).Italic().FontColor(Muted);
                }
                else
                {
                    foreach (var p in report.Products)
                    {
                        TableRow(table, p.ProductName, p.LicenseNumber ?? "—", p.ActiveIngredient ?? "—", p.ApplicationMethod ?? "—", p.DilutionRate ?? "—", $"{p.AmountUsed:0.###} {p.Unit}");
                    }
                }
            });
        });
    }

    private static void Ek1StationsSection(IContainer container, ServiceReport report)
    {
        if (report.Stations.Count == 0) return;
        var total = report.Stations.Count;
        var active = report.Stations.Count(s => s.HasActivity || s.DeviceStatus == "Activity" || s.CaughtCount > 0);
        var rate = total > 0 ? (decimal)active / total * 100 : 0;
        var totalCaught = report.Stations.Sum(s => s.CaughtCount);

        container.Column(col =>
        {
            col.Item().Row(r =>
            {
                r.RelativeItem().Text("4. İSTASYON KONTROLLERİ VE BULGULAR").FontSize(7.5f).Bold().FontColor(Blue);
                r.ConstantItem(260).AlignRight().Text($"Toplam: {total} | Aktivite: {active} (%{rate:0.#}) | Yakalanan: {totalCaught} Adet").FontSize(6.8f).Bold().FontColor(Navy);
            });
            col.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(cols =>
                {
                    cols.ConstantColumn(30);
                    cols.RelativeColumn(2.5f);
                    cols.RelativeColumn(1.8f);
                    cols.RelativeColumn(2.0f);
                    cols.ConstantColumn(35);
                    cols.RelativeColumn(1.8f);
                    cols.RelativeColumn(2.2f);
                });
                TableHeader(table, "No", "Alan / Konum", "Ekipman Türü", "Zararlı Türü", "Adet", "Durum", "Yapılan İşlem");
                foreach (var s in report.Stations.OrderBy(item => item.DeviceNumber).Take(30))
                {
                    TableRow(table, s.DeviceNumber, s.Area, s.DeviceType, s.TargetPest ?? "—", s.CaughtCount > 0 ? s.CaughtCount.ToString() : "0", s.DeviceStatus, s.AppliedProductName ?? s.ReplacementProductName ?? s.Notes ?? (s.PlateChanged ? "Plaka değişti" : "Kontrol edildi"));
                }
                if (report.Stations.Count > 30)
                {
                    table.Cell().ColumnSpan(7).BorderBottom(1).BorderColor(Border).Padding(4).AlignCenter().Text($"... ve {report.Stations.Count - 30} adet diğer istasyon kontrol edildi (Tüm detaylar sistemde mevcuttur).").FontSize(6.5f).Italic().FontColor(Muted);
                }
            });
        });
    }

    private static void Ek1FindingsSection(IContainer container, ServiceReport report)
    {
        var hasNotes = !string.IsNullOrWhiteSpace(report.ApplicationSummary) || !string.IsNullOrWhiteSpace(report.Findings) || !string.IsNullOrWhiteSpace(report.CorrectiveActions) || !string.IsNullOrWhiteSpace(report.Recommendations);
        if (!hasNotes) return;

        container.Column(col =>
        {
            col.Item().Text("5. UYGULAMA SONUCU, SAHA BULGULARI VE ÖNERİLER").FontSize(7.5f).Bold().FontColor(Blue);
            col.Item().PaddingTop(2).Table(table =>
            {
                table.ColumnsDefinition(cols => { cols.RelativeColumn(); cols.RelativeColumn(); });
                if (!string.IsNullOrWhiteSpace(report.ApplicationSummary)) Ek1Cell(table, "Yapılan Uygulama Özeti", report.ApplicationSummary);
                if (!string.IsNullOrWhiteSpace(report.Findings)) Ek1Cell(table, "Saha Bulguları", report.Findings);
                if (!string.IsNullOrWhiteSpace(report.CorrectiveActions)) Ek1Cell(table, "Düzeltici Faaliyetler", report.CorrectiveActions);
                if (!string.IsNullOrWhiteSpace(report.Recommendations)) Ek1Cell(table, "Öneriler", report.Recommendations);
            });
        });
    }

    private static void Ek1SignaturesSection(IContainer container, ServiceReport report)
    {
        container.Column(col =>
        {
            col.Item().Text("6. DİJİTAL ONAY VE İMZALAR").FontSize(7.5f).Bold().FontColor(Blue);
            col.Item().PaddingTop(2).Row(row =>
            {
                row.RelativeItem().Element(c => SignatureBox(c, "Uygulayıcı / Ekip Sorumlusu", report.TeamManager ?? report.CreatedByAccount.DisplayName, report.ManagerSignatureData));
                row.ConstantItem(12);
                row.RelativeItem().Element(c => SignatureBox(c, "Müşteri Yetkilisi", report.CustomerRepresentativeName ?? report.WorkOrder.Customer.LegalName, report.CustomerSignatureData));
            });
        });
    }

    private static void Ek1Footer(IContainer container, ServiceReport report)
    {
        container.PaddingTop(4).BorderTop(1).BorderColor(Border).Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Text(t =>
                {
                    t.Span("Ulusal Zehir Danışma Merkezi (UZEM): 114  ·  Acil Çağrı: 112").Bold().FontColor("#B42318").FontSize(7);
                    t.Span("  |  Bu belge Sağlık Bakanlığı Biyosidal Ürünlerin Kullanım Usul ve Esasları Yönetmeliği Ek-1 hükümlerine uygun resmi elektronik işlem belgesidir.").FontSize(6.2f).FontColor(Muted);
                });
                row.ConstantItem(85).AlignRight().Text(text =>
                {
                    text.DefaultTextStyle(style => style.FontSize(6.8f).FontColor(Muted));
                    text.Span("Sayfa "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages();
                });
            });
        });
    }

    private static void Ek1Cell(TableDescriptor table, string label, string value)
    {
        table.Cell().Border(1).BorderColor(Border).PaddingVertical(3).PaddingHorizontal(5).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(5.8f).Bold().FontColor(Muted);
            column.Item().PaddingTop(1).Text(string.IsNullOrWhiteSpace(value) ? "—" : value).FontSize(6.8f).SemiBold().FontColor(Navy);
        });
    }

    private static void SignatureBox(IContainer container, string label, string? name, string? signatureData)
    {
        var imageBytes = ParseBase64Image(signatureData);
        container.Border(1).BorderColor(Border).Background(Surface).Padding(6).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(6.5f).Bold().FontColor(Muted);
            if (imageBytes is { Length: > 0 })
            {
                column.Item().Height(34).AlignMiddle().AlignCenter().Image(imageBytes).FitArea();
            }
            else
            {
                column.Item().Height(34).AlignMiddle().AlignCenter().Text("Elektronik Onaylandı / İmzalandı").FontSize(7.5f).Italic().FontColor(Muted);
            }
            column.Item().PaddingTop(2).AlignCenter().Text(name ?? "Yetkili İmzası").FontSize(7.5f).Bold().FontColor(Navy);
        });
    }

    private static byte[]? ParseBase64Image(string? dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl)) return null;
        try
        {
            var commaIndex = dataUrl.IndexOf(',', StringComparison.Ordinal);
            var base64 = commaIndex >= 0 ? dataUrl[(commaIndex + 1)..] : dataUrl;
            return Convert.FromBase64String(base64);
        }
        catch
        {
            return null;
        }
    }
}
