using Pesneer.Api.Domain;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Pesneer.Api.Commercial;

public static class CommercialPdfRenderer
{
    public static byte[] Profitability(ProfitabilitySummaryResponse summary, Company company) => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4.Landscape());
            page.Margin(28);
            page.DefaultTextStyle(style => style.FontSize(8).FontColor("#243B53"));
            page.Header().Element(header => Header(header, company, "AYLIK OPERASYON KÂRLILIK RAPORU", $"{summary.PeriodStart:MM.yyyy}"));
            page.Content().PaddingVertical(14).Column(column =>
            {
                column.Spacing(12);
                column.Item().Text($"Rapor dönemi: {summary.PeriodStart:dd.MM.yyyy} – {summary.PeriodEnd:dd.MM.yyyy}")
                    .FontSize(10).SemiBold().FontColor("#0B315A");
                column.Item().Row(row =>
                {
                    row.RelativeItem().Element(card => Info(card, "Gelir", $"{summary.Revenue:N2} ₺", $"Tamamlanan {summary.Rows.Sum(item => item.CompletedVisits)} ziyaret"));
                    row.ConstantItem(10);
                    row.RelativeItem().Element(card => Info(card, "Toplam maliyet", $"{summary.TotalCost:N2} ₺", "Ürün, personel, yakıt ve ek maliyetler"));
                    row.ConstantItem(10);
                    row.RelativeItem().Element(card => Info(card, "Brüt kâr", $"{summary.GrossProfit:N2} ₺", $"Kâr marjı %{summary.MarginPercent:N1}"));
                    row.ConstantItem(10);
                    row.RelativeItem().Element(card => Info(card, "Tahsilat", $"%{summary.CollectionRate:N1}", $"Açık bakiye {summary.ReceivableBalance:N2} ₺"));
                });
                if (summary.UnpricedUsageCount > 0)
                {
                    column.Item().Border(1).BorderColor("#F5C26B").Background("#FFF8E8").Padding(9)
                        .Text($"Maliyet bilgisi girilmemiş {summary.UnpricedUsageCount} stok kullanımı hesaplamaya 0 ₺ olarak dahil edildi.")
                        .SemiBold().FontColor("#8A5A00");
                }
                column.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(2.6f); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn();
                        columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn();
                    });
                    table.Header(header =>
                    {
                        Cell(header.Cell(), "Müşteri / Şube", true); Cell(header.Cell(), "Gelir", true);
                        Cell(header.Cell(), "Ürün", true); Cell(header.Cell(), "Personel", true);
                        Cell(header.Cell(), "Yakıt", true); Cell(header.Cell(), "Ek maliyet", true);
                        Cell(header.Cell(), "Brüt kâr", true); Cell(header.Cell(), "Marj", true);
                    });
                    foreach (var item in summary.Rows)
                    {
                        Cell(table.Cell(), $"{item.CustomerName}\n{item.BranchName} · {item.CompletedVisits} ziyaret");
                        Cell(table.Cell(), $"{item.Revenue:N2} ₺"); Cell(table.Cell(), $"{item.ProductCost:N2} ₺");
                        Cell(table.Cell(), $"{item.PersonnelCost:N2} ₺"); Cell(table.Cell(), $"{item.FuelCost:N2} ₺");
                        Cell(table.Cell(), $"{item.RepeatVisitCost + item.EmergencyCallCost + item.OtherCost:N2} ₺");
                        Cell(table.Cell(), $"{item.GrossProfit:N2} ₺"); Cell(table.Cell(), $"%{item.MarginPercent:N1}");
                    }
                    if (summary.Rows.Count == 0)
                        Cell(table.Cell().ColumnSpan(8), "Seçilen ayda tamamlanmış ve maliyetlendirilmiş iş bulunmuyor.");
                });
                column.Item().Text("Bu rapor operasyonel yönetim ve iç kârlılık takibi içindir; resmi muhasebe belgesi, e-Fatura veya vergi beyannamesi değildir.")
                    .FontSize(7).Italic().FontColor("#6F8397");
            });
            page.Footer().AlignCenter().Text(text =>
            {
                text.Span("Pestneer operasyonel kârlılık raporu  •  ");
                text.CurrentPageNumber(); text.Span(" / "); text.TotalPages();
            });
        });
    }).GeneratePdf();

    public static byte[] Proposal(CommercialProposal proposal, Company company) => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(34);
            page.DefaultTextStyle(style => style.FontSize(9).FontColor("#243B53"));
            page.Header().Element(header => Header(header, company, "HİZMET TEKLİFİ", proposal.Number));
            page.Content().PaddingVertical(18).Column(column =>
            {
                column.Spacing(14);
                column.Item().Row(row =>
                {
                    row.RelativeItem().Element(card => Info(card, "Müşteri", proposal.Customer.LegalName, proposal.CustomerBranch?.Name ?? "Merkez / Genel"));
                    row.ConstantItem(18);
                    row.RelativeItem().Element(card => Info(card, "Teklif", proposal.IssueDate.ToString("dd.MM.yyyy"), $"Geçerlilik: {proposal.ValidUntil:dd.MM.yyyy}"));
                });
                column.Item().Text(proposal.Title).FontSize(18).SemiBold().FontColor("#0B315A");
                column.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns => { columns.RelativeColumn(5); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn(1.5f); });
                    table.Header(header => { Cell(header.Cell(), "Hizmet / Açıklama", true); Cell(header.Cell(), "Miktar", true); Cell(header.Cell(), "Birim", true); Cell(header.Cell(), "Tutar", true); });
                    foreach (var line in proposal.Lines.OrderBy(item => item.SortOrder))
                    {
                        Cell(table.Cell(), line.Description); Cell(table.Cell(), line.Quantity.ToString("N2")); Cell(table.Cell(), line.Unit); Cell(table.Cell(), $"{line.LineTotal:N2} {proposal.Currency}");
                    }
                });
                column.Item().AlignRight().Width(240).Column(total =>
                {
                    Total(total, "Ara toplam", proposal.Subtotal, proposal.Currency);
                    Total(total, "İndirim", -proposal.DiscountAmount, proposal.Currency);
                    Total(total, $"KDV %{proposal.VatRate:N0}", proposal.VatAmount, proposal.Currency);
                    total.Item().PaddingTop(6).BorderTop(1).BorderColor("#B8CADB").PaddingTop(7).Row(row => { row.RelativeItem().Text("GENEL TOPLAM").Bold(); row.RelativeItem().AlignRight().Text($"{proposal.TotalAmount:N2} {proposal.Currency}").FontSize(13).Bold().FontColor("#1269C7"); });
                });
                if (!string.IsNullOrWhiteSpace(proposal.Notes)) column.Item().Element(card => Note(card, "Notlar", proposal.Notes));
                if (!string.IsNullOrWhiteSpace(proposal.Terms)) column.Item().Element(card => Note(card, "Ticari Koşullar", proposal.Terms));
                column.Item().PaddingTop(16).Row(row => { row.RelativeItem().Text("Firma Yetkilisi\n\nİmza / Kaşe").SemiBold(); row.RelativeItem().AlignRight().Text("Müşteri Yetkilisi\n\nİmza / Kaşe").SemiBold(); });
            });
            page.Footer().AlignCenter().Text(text => { text.Span("Bu belge Pestneer üzerinden firma adına oluşturulmuştur.  •  "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages(); });
        });
    }).GeneratePdf();

    public static byte[] Contract(CustomerContract contract, Company company) => Document.Create(document =>
    {
        document.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.Margin(34);
            page.DefaultTextStyle(style => style.FontSize(9).FontColor("#243B53"));
            page.Header().Element(header => Header(header, company, "HİZMET SÖZLEŞMESİ", contract.Number));
            page.Content().PaddingVertical(18).Column(column =>
            {
                column.Spacing(14);
                column.Item().Text(contract.Title).FontSize(18).SemiBold().FontColor("#0B315A");
                column.Item().Row(row => { row.RelativeItem().Element(card => Info(card, "Müşteri", contract.Customer.LegalName, contract.CustomerBranch?.Name ?? "Merkez / Genel")); row.ConstantItem(18); row.RelativeItem().Element(card => Info(card, "Dönem", contract.StartDate.ToString("dd.MM.yyyy"), contract.EndDate.ToString("dd.MM.yyyy"))); });
                column.Item().Element(card => Info(card, "Faturalama planı", Frequency(contract.BillingFrequency), $"Dönem bedeli: {contract.PeriodAmount:N2} {contract.Currency} • Vade: {contract.PaymentTermDays} gün"));
                column.Item().Row(row =>
                {
                    row.RelativeItem().Element(card => Info(card, "Acil çağrı ve SLA", $"{contract.FreeEmergencyCallsPerYear} ücretsiz çağrı / yıl", $"Ek çağrı: {contract.ExtraEmergencyCallPrice:N2} {contract.Currency} • Müdahale: {contract.ResponseTimeHours} saat"));
                    row.ConstantItem(18);
                    row.RelativeItem().Element(card => Info(card, "Yenileme", contract.AutoRenew ? "Otomatik yenileme açık" : "Manuel yenileme", $"Bildirim: {contract.RenewalNoticeDays} gün • Yıllık artış: %{contract.AnnualPriceIncreaseRate:N2}"));
                });
                if (contract.ServicePlans.Count > 0)
                {
                    column.Item().Text("ŞUBE VE HİZMET PLANI").FontSize(8).Bold().FontColor("#1269C7");
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns => { columns.RelativeColumn(1.5f); columns.RelativeColumn(2); columns.RelativeColumn(); columns.RelativeColumn(); columns.RelativeColumn(); });
                        table.Header(header => { Cell(header.Cell(), "Şube", true); Cell(header.Cell(), "Hizmet", true); Cell(header.Cell(), "Periyot", true); Cell(header.Cell(), "Plan", true); Cell(header.Cell(), "Bedel", true); });
                        foreach (var plan in contract.ServicePlans.Where(item => item.IsActive).OrderBy(item => item.CustomerBranch?.Name).ThenBy(item => item.ServiceType))
                        {
                            Cell(table.Cell(), plan.CustomerBranch?.Name ?? "Merkez / Genel");
                            Cell(table.Cell(), plan.ServiceType);
                            Cell(table.Cell(), plan.RecurrenceType == "Weekly" ? $"Haftada {plan.VisitsPerPeriod}" : plan.RecurrenceType == "Monthly" ? $"Ayda {plan.VisitsPerPeriod}" : "Manuel");
                            Cell(table.Cell(), $"{plan.PreferredTime} • {plan.DurationMinutes} dk.");
                            Cell(table.Cell(), $"{plan.BranchPrice:N2} {contract.Currency}");
                        }
                    });
                }
                column.Item().Element(card => Note(card, "Hizmet Kapsamı", contract.Scope ?? "Taraflarca onaylanan teklif ve hizmet planındaki periyodik zararlı mücadelesi hizmetleri."));
                column.Item().Element(card => Note(card, "Sözleşme Koşulları", contract.Terms ?? "Hizmetler planlanan periyotlarda gerçekleştirilir. Taraflar, saha erişimi ve yasal gereklilikler konusunda gerekli iş birliğini sağlar."));
                column.Item().PaddingTop(20).Row(row => { row.RelativeItem().Text($"{company.LegalName}\nFirma Yetkilisi\n\nİmza / Kaşe").SemiBold(); row.RelativeItem().AlignRight().Text($"{contract.Customer.LegalName}\nMüşteri Yetkilisi\n\nİmza / Kaşe").SemiBold(); });
            });
            page.Footer().AlignCenter().Text(text => { text.Span("Sözleşme No: "); text.Span(contract.Number).Bold(); text.Span("  •  "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages(); });
        });
    }).GeneratePdf();

    private static void Header(IContainer container, Company company, string title, string number) => container.Row(row =>
    {
        row.ConstantItem(92).Height(54).AlignMiddle().Element(logo => { if (company.LogoData is { Length: > 0 }) logo.Image(company.LogoData).FitArea(); else logo.Text(company.LegalName).Bold().FontSize(11).FontColor("#0A7058"); });
        row.RelativeItem().AlignCenter().AlignMiddle().Column(column => { column.Item().AlignCenter().Text(title).FontSize(14).Bold().FontColor("#0B315A"); column.Item().AlignCenter().Text(company.LegalName).FontSize(8).FontColor("#607D96"); });
        row.ConstantItem(100).AlignRight().AlignMiddle().Column(column => { column.Item().Text(number).Bold(); column.Item().Text(DateTimeOffset.Now.ToString("dd.MM.yyyy")).FontColor("#7890A6"); });
    });
    private static void Info(IContainer container, string label, string value, string detail) => container.Border(1).BorderColor("#D8E4EE").Background("#F7FAFC").Padding(12).Column(column => { column.Item().Text(label.ToUpperInvariant()).FontSize(7).FontColor("#7B91A6"); column.Item().PaddingTop(4).Text(value).Bold(); column.Item().PaddingTop(2).Text(detail).FontSize(8).FontColor("#6F8397"); });
    private static void Note(IContainer container, string title, string value) => container.Border(1).BorderColor("#D8E4EE").Padding(12).Column(column => { column.Item().Text(title).Bold().FontColor("#1269C7"); column.Item().PaddingTop(5).Text(value).LineHeight(1.45f); });
    private static void Cell(IContainer container, string text, bool header = false) { var cell = container.BorderBottom(1).BorderColor("#DCE6EF").Padding(8); if (header) cell.Background("#EAF3FB").Text(text).Bold(); else cell.Text(text); }
    private static void Total(ColumnDescriptor column, string label, decimal amount, string currency) => column.Item().PaddingVertical(3).Row(row => { row.RelativeItem().Text(label); row.RelativeItem().AlignRight().Text($"{amount:N2} {currency}"); });
    private static string Frequency(string value) => value switch { "Weekly" => "Haftalık", "Quarterly" => "3 aylık", "SemiAnnual" => "6 aylık", "Annual" => "Yıllık", "Manual" => "Manuel", _ => "Aylık" };
}
