using Pesneer.Api.Domain;
using Pesneer.Api.Reports;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Pesneer.Api.StationActivations;

internal static class StationActivationPdfRenderer
{
    private const string Navy = "#102A43";
    private const string Blue = "#2563EB";
    private const string Border = "#D8E2EE";

    public static byte[] Render(StationActivation activation, IReadOnlyList<ServiceReportStationInput> stations, Company company)
        => Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(24);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(8).FontColor(Navy));
                page.Header().Row(row =>
                {
                    row.RelativeItem().Row(brand =>
                    {
                        if (company.LogoData is { Length: > 0 }) brand.ConstantItem(64).Height(42).Image(company.LogoData).FitArea();
                        brand.RelativeItem().PaddingLeft(8).Column(column =>
                        {
                            column.Item().Text(company.LegalName).Bold().FontSize(11);
                            column.Item().Text("Zararlı Mücadelesi İstasyon Aktivasyon Listesi").FontColor(Blue).SemiBold();
                        });
                    });
                    row.ConstantItem(210).AlignRight().Column(column =>
                    {
                        column.Item().AlignRight().Text(activation.Number).Bold();
                        column.Item().AlignRight().Text($"İş emri: {activation.WorkOrder.Number}");
                        column.Item().AlignRight().Text($"Tarih: {activation.WorkOrder.ScheduledAt:dd.MM.yyyy HH:mm}");
                    });
                });
                page.Content().PaddingTop(12).Column(column =>
                {
                    column.Spacing(8);
                    column.Item().Border(1).BorderColor(Border).Padding(8).Row(row =>
                    {
                        row.RelativeItem().Text($"Müşteri: {activation.WorkOrder.Customer.LegalName}").Bold();
                        row.RelativeItem().Text($"Şube: {activation.WorkOrder.CustomerBranch?.Name ?? "Merkez / Genel"}");
                        row.RelativeItem().Text($"Uygulayıcı: {activation.CreatedByAccount.DisplayName}");
                        row.RelativeItem().AlignRight().Text($"Toplam: {stations.Count} · Aktivite: {stations.Count(item => item.HasActivity)}");
                    });
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.ConstantColumn(55); columns.RelativeColumn(1.3f); columns.ConstantColumn(70);
                            columns.ConstantColumn(80); columns.RelativeColumn(); columns.ConstantColumn(40); columns.RelativeColumn(1.1f); columns.RelativeColumn(1.2f);
                        });
                        foreach (var title in new[] { "İstasyon", "Konum / Alan", "Ekipman", "Durum", "Zararlı / Aktivite", "Adet", "Yapılan İşlemler", "İşlem / Açıklama" })
                            table.Cell().Background(Navy).Padding(6).Text(title).FontColor(Colors.White).Bold();
                        foreach (var station in stations.OrderBy(item => item.DeviceNumber, StringComparer.OrdinalIgnoreCase))
                        {
                            Cell(table, station.DeviceNumber, true); Cell(table, station.Area); Cell(table, station.DeviceType);
                            Cell(table, Status(station.DeviceStatus)); Cell(table, station.TargetPest ?? station.ActivityType ?? "—");
                            Cell(table, station.CaughtCount > 0 ? station.CaughtCount.ToString() : "—");
                            Cell(table, Checklist(station));
                            var operation = station.AppliedProductName is not null ? $"{station.AppliedProductName} · {station.AppliedAmount} {station.AppliedUnit}" : station.ReplacementProductName is not null ? $"Değişim: {station.ReplacementProductName} · {station.ReplacementQuantity} {station.ReplacementUnit}" : station.Notes ?? "—";
                            Cell(table, operation);
                        }
                    });
                    if (!string.IsNullOrWhiteSpace(activation.Notes)) column.Item().Border(1).BorderColor(Border).Padding(8).Text(text => { text.Span("Genel not: ").Bold(); text.Span(activation.Notes); });
                });
                page.Footer().AlignCenter().Text(text => { text.Span("Pestneer dijital aktivasyon kaydı · "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages(); });
            });
        }).GeneratePdf();

    private static void Cell(TableDescriptor table, string value, bool bold = false)
    {
        var cell = table.Cell().BorderBottom(1).BorderColor(Border).Padding(5).Text(value);
        if (bold) cell.Bold();
    }

    private static string Status(string value) => value switch
    {
        "Activity" => "Aktivite var", "NoActivity" => "Aktivite yok", "Damaged" => "Kırık / hasarlı",
        "Inaccessible" => "Ulaşılamadı", "Missing" => "Kayıp", "Replaced" => "Değiştirildi", _ => value
    };

    private static string Checklist(ServiceReportStationInput station)
    {
        var items = new List<string>(7);
        if (station.BaitGelCompleted) items.Add("Y/J");
        if (station.StickyPlateChanged) items.Add("P.D");
        if (station.StationCleaned) items.Add("T");
        if (station.StationRelocated) items.Add("Y.D");
        if (station.StationReplaced) items.Add("D");
        if (station.LockCheckDone) items.Add("K");
        if (station.LabelRenewed) items.Add("E");
        return items.Count > 0 ? string.Join(", ", items) : "—";
    }
}
