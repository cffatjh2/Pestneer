using System.Globalization;
using System.Text.Json;
using Pesneer.Api.Domain;
using Pesneer.Api.SitePlans;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Pesneer.Api.Quality;

internal static class QualityDocumentRenderer
{
    private const string Navy = "#102A43";
    private const string Blue = "#1769C2";
    private const string Green = "#10A37F";
    private const string Text = "#243B53";
    private const string Muted = "#627D98";
    private const string Border = "#D9E2EC";
    private const string Surface = "#F3F7FA";

    public static byte[] Render(QualityAnalysis analysis, string companyName, byte[]? companyLogo)
    {
        using var payload = JsonDocument.Parse(analysis.PayloadJson);
        var root = payload.RootElement;

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(34);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(9).FontColor(Text));
                page.Header().Element(container => ComposeHeader(container, analysis, companyName, companyLogo));
                page.Content().PaddingVertical(16).Column(column =>
                {
                    column.Spacing(12);
                    column.Item().Element(container => ComposeHero(container, analysis));
                    column.Item().Element(container => ComposeMetadata(container, analysis));

                    if (analysis.AnalysisType == "Trend")
                    {
                        ComposeTrend(column, root);
                    }
                    else
                    {
                        ComposeRisk(column, root);
                    }

                    AddPanel(column, "Saha Bulguları", analysis.Findings);
                    AddPanel(column, "Öneriler ve Düzeltici Faaliyetler", analysis.Recommendations);

                    if (root.TryGetProperty("disclaimer", out var disclaimer) && !string.IsNullOrWhiteSpace(disclaimer.GetString()))
                    {
                        column.Item().BorderLeft(3).BorderColor(Green).Background("#EAF8F4").Padding(10)
                            .Text(disclaimer.GetString()!).FontSize(8).FontColor(Muted);
                    }
                });
                page.Footer().Element(ComposeFooter);
            });
        }).GeneratePdf();
    }

    private static void ComposeHeader(IContainer container, QualityAnalysis analysis, string companyName, byte[]? companyLogo)
    {
        container.PaddingBottom(12).BorderBottom(2).BorderColor(Green).Row(row =>
        {
            row.RelativeItem().Column(column =>
            {
                if (companyLogo is { Length: > 0 })
                {
                    column.Item().Height(42).AlignLeft().Image(companyLogo).FitArea();
                    column.Item().PaddingTop(3).Text(companyName).FontSize(8).SemiBold().FontColor(Navy);
                }
                else
                {
                    column.Item().Text(companyName).FontSize(18).ExtraBold().FontColor(Navy);
                    column.Item().Text("ZARARLI MÜCADELESİ VE SAHA KALİTE BELGESİ").FontSize(7).SemiBold().FontColor(Muted).LetterSpacing(0.08f);
                }
            });

            row.ConstantItem(175).AlignRight().Column(column =>
            {
                column.Item().Text("BELGE NUMARASI").FontSize(7).SemiBold().FontColor(Muted);
                column.Item().Text(analysis.Number).FontSize(12).Bold().FontColor(Navy);
                column.Item().Text(analysis.CreatedAt.ToOffset(TimeSpan.FromHours(3)).ToString("dd.MM.yyyy HH:mm", CultureInfo.GetCultureInfo("tr-TR"))).FontSize(8).FontColor(Muted);
            });
        });
    }

    private static void ComposeHero(IContainer container, QualityAnalysis analysis)
    {
        container.Background(Surface).Padding(15).Row(row =>
        {
            row.RelativeItem().PaddingRight(14).Column(column =>
            {
                column.Spacing(5);
                column.Item().Text(analysis.AnalysisType == "Trend" ? "CANLI YAKALAMA VE SAHA TRENDİ" : "HAŞERE YÖNETİMİ RİSK DEĞERLENDİRMESİ")
                    .FontSize(7).SemiBold().FontColor(Green).LetterSpacing(0.1f);
                column.Item().Text(analysis.Title).FontSize(19).ExtraBold().FontColor(Navy);
                if (!string.IsNullOrWhiteSpace(analysis.Summary))
                {
                    column.Item().Text(analysis.Summary).FontSize(9).LineHeight(1.35f).FontColor(Muted);
                }
            });

            row.ConstantItem(92).Background(Blue).Padding(12).AlignCenter().Column(column =>
            {
                column.Item().AlignCenter().Text(analysis.AnalysisType == "Trend" ? "AKTİVİTE" : "RİSK PUANI").FontSize(7).SemiBold().FontColor(Colors.White);
                column.Item().AlignCenter().Text(analysis.Score?.ToString(CultureInfo.InvariantCulture) ?? "-").FontSize(27).ExtraBold().FontColor(Colors.White);
                column.Item().AlignCenter().Text(analysis.Level ?? "Bilgilendirme").FontSize(8).FontColor("#DCEBFA");
            });
        });
    }

    private static void ComposeMetadata(IContainer container, QualityAnalysis analysis)
    {
        var location = analysis.CustomerBranch?.Name ?? "Genel / Merkez";
        container.Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn();
                columns.RelativeColumn();
            });

            MetadataCell(table, "Müşteri", analysis.Customer.LegalName);
            MetadataCell(table, "Lokasyon", location);
            MetadataCell(table, "Dönem", $"{analysis.PeriodStart:dd.MM.yyyy} - {analysis.PeriodEnd:dd.MM.yyyy}");
            MetadataCell(table, "Hazırlayan", analysis.CreatedByAccount.DisplayName);
        });
    }

    private static void ComposeTrend(ColumnDescriptor column, JsonElement root)
    {
        column.Item().Element(container => ComposeTrendMetrics(container, root));
        column.Item().Element(container => ComposeTrendTable(container, root));
        column.Item().Element(container => ComposePestTable(container, root));
    }

    private static void ComposeTrendMetrics(IContainer container, JsonElement root)
    {
        container.Row(row =>
        {
            Metric(row, "Rapor", Read(root, "reportCount"));
            Metric(row, "İstasyon", Read(root, "totalStations"));
            Metric(row, "Aktif İstasyon", Read(root, "activeStations"));
            Metric(row, "Toplam Yakalama", Read(root, "totalCaught"));
        });
    }

    private static void ComposeTrendTable(IContainer container, JsonElement root)
    {
        container.Column(column =>
        {
            SectionTitle(column, "Dönemsel İstasyon Sonuçları");
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(1.3f);
                    columns.RelativeColumn();
                    columns.RelativeColumn();
                    columns.RelativeColumn();
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn();
                    columns.RelativeColumn(1.2f);
                });
                TableHeader(table, "Dönem", "Rapor", "İstasyon", "Aktivite", "Plaka Değişimi", "Yakalama", "Aktivite %");

                if (root.TryGetProperty("periods", out var periods))
                {
                    foreach (var item in periods.EnumerateArray())
                    {
                        TableRow(table, Read(item, "period"), Read(item, "reportCount"), Read(item, "totalStations"), Read(item, "activeStations"), Read(item, "plateChanges"), Read(item, "totalCaught"), $"%{Read(item, "activityRate")}");
                    }
                }
            });
        });
    }

    private static void ComposePestTable(IContainer container, JsonElement root)
    {
        container.Column(column =>
        {
            SectionTitle(column, "Gözlemlenen Zararlı Dağılımı");
            column.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(3);
                    columns.RelativeColumn();
                });
                TableHeader(table, "Zararlı", "Toplam Gözlem / Yakalama");

                if (root.TryGetProperty("pestTotals", out var pests))
                {
                    foreach (var item in pests.EnumerateArray())
                    {
                        TableRow(table, Read(item, "pest"), Read(item, "totalCaught"));
                    }
                }
            });
        });
    }

    private static void ComposeRisk(ColumnDescriptor column, JsonElement root)
    {
        column.Item().Row(row =>
        {
            Metric(row, "Yapısal / Operasyonel", $"{Read(root, "structuralRiskScore")}/100");
            Metric(row, "Lokasyon Matrisi", $"{Read(root, "matrixRiskScore")}/100");
            Metric(row, "Konuma Bağlı Hava", $"{Read(root, "weatherRiskScore")}/100");
            Metric(row, "Birleşik Risk", $"{Read(root, "overallRiskScore")}/100");
        });

        column.Item().Background("#EAF4FC").Padding(11).Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn();
                columns.RelativeColumn();
                columns.RelativeColumn();
            });
            MetadataCell(table, "Sektör", Read(root, "sectorType") == "Food" ? "Gıda üretimi / hizmeti" : "Gıda dışı işletme");
            MetadataCell(table, "Mevcut Kontrol", Read(root, "currentFrequency"));
            MetadataCell(table, "Önerilen Kontrol", Read(root, "recommendedFrequency"));
        });

        column.Item().Column(section =>
        {
            SectionTitle(section, "Yapısal ve Operasyonel Kontrol Formu");
            section.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(3.4f);
                    columns.ConstantColumn(42);
                    columns.RelativeColumn(2);
                });
                TableHeader(table, "Bölüm", "Kontrol Noktası", "Risk", "Açıklama");

                if (root.TryGetProperty("answers", out var answers))
                {
                    foreach (var item in answers.EnumerateArray())
                    {
                        TableRow(table, Read(item, "category"), Read(item, "question"), $"{Read(item, "score")}/4", Read(item, "note"));
                    }
                }
            });
        });

        if (root.TryGetProperty("riskMatrix", out var matrix) && matrix.ValueKind == JsonValueKind.Array && matrix.GetArrayLength() > 0)
        {
            column.Item().Column(section =>
            {
                SectionTitle(section, "Lokasyon Bazlı Zararlı Risk Matrisi");
                section.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(1.6f);
                        columns.RelativeColumn(1.4f);
                        columns.ConstantColumn(38);
                        columns.ConstantColumn(38);
                        columns.ConstantColumn(42);
                        columns.RelativeColumn(2.2f);
                    });
                    TableHeader(table, "Lokasyon", "Zararlı Grubu", "Şiddet", "Olasılık", "Risk", "Bulgu / Açıklama");

                    foreach (var item in matrix.EnumerateArray())
                    {
                        var score = ReadInt(item, "severity") * ReadInt(item, "likelihood");
                        TableRow(table, Read(item, "location"), Read(item, "pestCategory"), Read(item, "severity"), Read(item, "likelihood"), score.ToString(CultureInfo.InvariantCulture), Read(item, "note"));
                    }
                });
            });
        }

        if (root.TryGetProperty("weather", out var weather)
            && weather.ValueKind == JsonValueKind.Object
            && weather.TryGetProperty("weather", out var observation)
            && observation.ValueKind == JsonValueKind.Object)
        {
            column.Item().Background("#EAF4FC").Padding(11).Row(row =>
            {
                row.RelativeItem().Text("Konumun güncel hava özeti").SemiBold().FontColor(Navy);
                row.RelativeItem().AlignRight().Text($"{Read(observation, "condition")}  |  {Read(observation, "temperatureC")} °C  |  %{Read(observation, "relativeHumidity")} nem").FontColor(Muted);
            });
        }

        if (root.TryGetProperty("generatedRecommendations", out var generatedRecommendations)
            && generatedRecommendations.ValueKind == JsonValueKind.Array
            && generatedRecommendations.GetArrayLength() > 0)
        {
            column.Item().Border(1).BorderColor(Border).Padding(11).Column(panel =>
            {
                panel.Spacing(5);
                panel.Item().Text("OTOMATİK DÜZELTİCİ FAALİYET ÖNERİLERİ").FontSize(7).SemiBold().FontColor(Muted).LetterSpacing(0.08f);
                foreach (var recommendation in generatedRecommendations.EnumerateArray())
                {
                    panel.Item().Text($"• {recommendation.GetString()}").FontSize(8.5f).LineHeight(1.35f).FontColor(Text);
                }
            });
        }

        if (root.TryGetProperty("sitePlan", out var sitePlanJson) && sitePlanJson.ValueKind == JsonValueKind.Object)
        {
            column.Item().PageBreak();
            ComposeRiskSitePlanPage(column, sitePlanJson);
        }
    }

    private static void ComposeRiskSitePlanPage(ColumnDescriptor column, JsonElement sitePlanJson)
    {
        var planTitle = Read(sitePlanJson, "title");
        var planNumber = Read(sitePlanJson, "number");
        var areaName = Read(sitePlanJson, "areaName");
        var revision = Read(sitePlanJson, "revision");

        column.Item().Background(Surface).Padding(12).Row(row =>
        {
            row.RelativeItem().Column(titleCol =>
            {
                titleCol.Item().Text("PESTNEER SAHA KALİTE · MEKÂNSAL RİSK HARİTASI").FontSize(7).SemiBold().FontColor(Green).LetterSpacing(0.08f);
                titleCol.Item().Text("KROKİ BAZLI RİSK VE ALAN YOĞUNLUK PLANI").FontSize(14).ExtraBold().FontColor(Navy);
                titleCol.Item().Text($"{planTitle} · {areaName}").FontSize(8.5f).FontColor(Muted);
            });
            row.ConstantItem(150).AlignRight().Column(metaCol =>
            {
                metaCol.Item().Text("PLAN / REVİZYON").FontSize(6.5f).SemiBold().FontColor(Muted);
                metaCol.Item().Text($"{planNumber} (R{revision})").FontSize(9.5f).Bold().FontColor(Navy);
            });
        });

        SitePlanCanvasInput? canvas = null;
        var hotspots = new List<SitePlanRiskHotspot>();
        if (sitePlanJson.TryGetProperty("canvas", out var canvasElement))
        {
            try
            {
                canvas = JsonSerializer.Deserialize<SitePlanCanvasInput>(canvasElement.GetRawText(), new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            catch { }
        }

        if (sitePlanJson.TryGetProperty("hotspots", out var hotspotsElement) && hotspotsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var spot in hotspotsElement.EnumerateArray())
            {
                decimal? x = spot.TryGetProperty("x", out var xVal) && xVal.ValueKind == JsonValueKind.Number ? xVal.GetDecimal() : null;
                decimal? y = spot.TryGetProperty("y", out var yVal) && yVal.ValueKind == JsonValueKind.Number ? yVal.GetDecimal() : null;
                decimal? w = spot.TryGetProperty("width", out var wVal) && wVal.ValueKind == JsonValueKind.Number ? wVal.GetDecimal() : null;
                decimal? h = spot.TryGetProperty("height", out var hVal) && hVal.ValueKind == JsonValueKind.Number ? hVal.GetDecimal() : null;

                hotspots.Add(new SitePlanRiskHotspot(
                    Read(spot, "location"),
                    Read(spot, "pestCategory"),
                    ReadInt(spot, "score"),
                    Read(spot, "level"),
                    Read(spot, "note"),
                    Read(spot, "matchedElementId"),
                    x, y, w, h
                ));
            }
        }

        if (canvas is not null)
        {
            var svg = SitePlanPdfRenderer.BuildRiskSvg(canvas, hotspots);
            column.Item().Height(330).Border(1).BorderColor(Border).Background(Colors.White).Padding(4)
                .Svg(svg).FitArea();
        }

        if (hotspots.Count > 0)
        {
            column.Item().Column(section =>
            {
                SectionTitle(section, "Öncelikli Riskli Alanlar ve Müdahale Tablosu");
                section.Item().Table(table =>
                {
                    table.ColumnsDefinition(columns =>
                    {
                        columns.RelativeColumn(1.8f);
                        columns.RelativeColumn(1.4f);
                        columns.ConstantColumn(48);
                        columns.RelativeColumn(1.2f);
                        columns.RelativeColumn(2.6f);
                    });
                    TableHeader(table, "Lokasyon / İstasyon", "Zararlı Grubu", "Risk Skoru", "Risk Seviyesi", "Saha Notu & Önlem");

                    foreach (var spot in hotspots.OrderByDescending(h => h.Score))
                    {
                        var levelLabel = spot.Score >= 6 ? "Kritik / Yüksek" : spot.Score >= 3 ? "Orta" : "Düşük";
                        TableRow(table, spot.Location, spot.PestCategory, $"{spot.Score}/9", levelLabel, spot.Note ?? "-");
                    }
                });
            });
        }

        column.Item().BorderLeft(3).BorderColor(Navy).Background("#F0F4F8").Padding(9)
            .Text("Mesul Müdür & Uzman Notu: Kırmızı halkayla işaretlenen alanlar öncelikli zararlı aktivite ve giriş riski taşıyan odak noktalarıdır. Bu alanlarda yalıtım önlemleri tamamlanmalı ve izleme sıklığı haftalık olarak sürdürülmelidir.")
            .FontSize(8).FontColor(Navy);
    }

    private static void AddPanel(ColumnDescriptor column, string title, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        column.Item().Border(1).BorderColor(Border).Padding(11).Column(panel =>
        {
            panel.Spacing(5);
            panel.Item().Text(title.ToUpperInvariant()).FontSize(7).SemiBold().FontColor(Muted).LetterSpacing(0.08f);
            panel.Item().Text(value).FontSize(9).LineHeight(1.4f).FontColor(Text);
        });
    }

    private static void ComposeFooter(IContainer container)
    {
        container.PaddingTop(9).BorderTop(1).BorderColor(Border).Row(row =>
        {
            row.RelativeItem().Text("Pestneer tarafından dijital kayıtlar üzerinden oluşturulmuştur.").FontSize(7).FontColor(Muted);
            row.ConstantItem(90).AlignRight().Text(text =>
            {
                text.DefaultTextStyle(style => style.FontSize(7).FontColor(Muted));
                text.Span("Sayfa ");
                text.CurrentPageNumber();
                text.Span(" / ");
                text.TotalPages();
            });
        });
    }

    private static void MetadataCell(TableDescriptor table, string label, string value)
    {
        table.Cell().Padding(3).Border(1).BorderColor(Border).Padding(9).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(6.5f).SemiBold().FontColor(Muted);
            column.Item().PaddingTop(3).Text(value).FontSize(9).SemiBold().FontColor(Navy);
        });
    }

    private static void Metric(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().PaddingHorizontal(3).Background(Surface).Padding(10).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(6.5f).SemiBold().FontColor(Muted);
            column.Item().PaddingTop(4).Text(value).FontSize(13).Bold().FontColor(Navy);
        });
    }

    private static void SectionTitle(ColumnDescriptor column, string title)
    {
        column.Item().PaddingBottom(6).Text(title).FontSize(12).Bold().FontColor(Navy);
    }

    private static void TableHeader(TableDescriptor table, params string[] values)
    {
        table.Header(header =>
        {
            foreach (var value in values)
            {
                header.Cell().Background("#EAF2F8").BorderBottom(1).BorderColor(Border).PaddingVertical(7).PaddingHorizontal(5)
                    .Text(value).FontSize(7).SemiBold().FontColor(Navy);
            }
        });
    }

    private static void TableRow(TableDescriptor table, params string[] values)
    {
        foreach (var value in values)
        {
            table.Cell().BorderBottom(1).BorderColor(Border).PaddingVertical(7).PaddingHorizontal(5)
                .Text(string.IsNullOrWhiteSpace(value) ? "-" : value).FontSize(7.5f).FontColor(Text);
        }
    }

    private static string Read(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object) return "-";
        if (!item.TryGetProperty(property, out var value)) return "-";
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString() ?? "-",
            JsonValueKind.Null => "-",
            JsonValueKind.Undefined => "-",
            _ => value.ToString()
        };
    }

    private static int ReadInt(JsonElement item, string property)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value)) return 0;
        return value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : 0;
    }
}
