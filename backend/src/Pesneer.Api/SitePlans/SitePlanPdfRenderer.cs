using System.Globalization;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Pesneer.Api.Domain;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Pesneer.Api.SitePlans;

internal static class SitePlanPdfRenderer
{
    private const string Navy = "#102A43";
    private const string Green = "#10A37F";
    private const string Border = "#CBD5E1";
    private static readonly CultureInfo TurkishCulture = CultureInfo.GetCultureInfo("tr-TR");

    public static byte[] Render(SitePlan plan, SitePlanCanvasInput canvas, string companyName, byte[]? companyLogo)
    {
        var equipmentCounts = canvas.Elements
            .Where(item => item.Type == "station" && !string.IsNullOrWhiteSpace(item.EquipmentTypeId))
            .GroupBy(item => item.EquipmentTypeId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        return Document.Create(document =>
        {
            document.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(22);
                page.PageColor(Colors.White);
                page.DefaultTextStyle(style => style.FontFamily("Lato").FontSize(7.5f).FontColor(Navy));
                page.Header().Element(container => Header(container, plan, companyName, companyLogo));
                page.Content().PaddingVertical(8).Column(column =>
                {
                    column.Spacing(7);
                    column.Item().Element(container => Legend(container, canvas.EquipmentTypes, equipmentCounts));
                    column.Item().Height(390).Border(1).BorderColor(Border).Background(Colors.White).Padding(4)
                        .Svg(BuildSvg(canvas)).FitArea();
                });
                page.Footer().Element(container => Footer(container, plan));
            });
        }).GeneratePdf();
    }

    private static void Header(IContainer container, SitePlan plan, string companyName, byte[]? companyLogo)
    {
        container.Border(1).BorderColor(Navy).Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(1.2f);
                columns.RelativeColumn(2.6f);
                columns.RelativeColumn(1.2f);
            });
            table.Cell().Padding(8).AlignMiddle().Element(cell => CompanyBrand(cell, companyName, companyLogo));
            table.Cell().BorderLeft(1).BorderRight(1).BorderColor(Navy).Padding(8).AlignCenter().Column(column =>
            {
                column.Item().AlignCenter().Text("ZARARLI MÜCADELESİ EKİPMAN YERLEŞİM PLANI").ExtraBold().FontSize(11);
                column.Item().AlignCenter().Text("Pest Control Equipment Location Plan").FontSize(7).FontColor("#64748B");
                column.Item().PaddingTop(3).AlignCenter().Text(plan.Title).SemiBold().FontColor(Green);
            });
            table.Cell().Padding(10).AlignMiddle().AlignCenter().Column(column =>
            {
                column.Item().AlignCenter().Text(plan.Customer.LegalName).Bold().FontSize(9);
                column.Item().AlignCenter().Text(plan.CustomerBranch?.Name ?? "Genel / Merkez").FontSize(7).FontColor("#64748B");
            });
        });
    }

    private static void CompanyBrand(IContainer container, string companyName, byte[]? companyLogo)
    {
        container.Column(column =>
        {
            if (companyLogo is { Length: > 0 })
            {
                column.Item().Height(34).AlignLeft().Image(companyLogo).FitArea();
                column.Item().PaddingTop(3).Text(companyName).Bold().FontSize(7);
            }
            else
            {
                column.Item().Text(companyName).Bold().FontSize(9);
            }
        });
    }

    private static void Legend(IContainer container, IReadOnlyList<SitePlanEquipmentTypeInput> types, IReadOnlyDictionary<string, int> counts)
    {
        container.Border(1).BorderColor(Border).Padding(6).Row(row =>
        {
            row.ConstantItem(120).AlignMiddle().Column(column =>
            {
                column.Item().Text("EKİPMAN LEJANTI").Bold().FontSize(8);
                column.Item().Text("Kod, sembol ve adet").FontSize(6.5f).FontColor("#64748B");
            });
            foreach (var type in types.Where(type => counts.ContainsKey(type.Id)).Take(8))
            {
                row.RelativeItem().PaddingHorizontal(3).AlignMiddle().Row(item =>
                {
                    item.ConstantItem(18).Height(18).Svg(EquipmentSymbol(type.Shape, type.Color, type.Code)).FitArea();
                    item.RelativeItem().PaddingLeft(3).Column(column =>
                    {
                        column.Item().Text($"{type.Code} - {type.Name}").SemiBold().FontSize(6.5f);
                        column.Item().Text($"{counts[type.Id]} adet").FontSize(6).FontColor("#64748B");
                    });
                });
            }
        });
    }

    private static void Footer(IContainer container, SitePlan plan)
    {
        container.Border(1).BorderColor(Navy).Table(table =>
        {
            table.ColumnsDefinition(columns =>
            {
                columns.RelativeColumn(1.1f);
                columns.RelativeColumn(.8f);
                columns.RelativeColumn(.8f);
                columns.RelativeColumn(1.2f);
                columns.RelativeColumn(1.4f);
                columns.RelativeColumn(.6f);
            });
            FooterCell(table, "Belge No", plan.Number);
            FooterCell(table, "Tarih", plan.UpdatedAt.ToOffset(TimeSpan.FromHours(3)).ToString("dd.MM.yyyy", TurkishCulture));
            FooterCell(table, "Revizyon", $"R{plan.Revision:00}");
            FooterCell(table, "Bölge / Kılavuz", $"{plan.AreaName} · {plan.FieldGuide}");
            FooterCell(table, "Hazırlayan", plan.CreatedByAccount.DisplayName);
            FooterCell(table, "Sayfa", "1 / 1");
        });
    }

    private static void FooterCell(TableDescriptor table, string label, string value)
    {
        table.Cell().BorderRight(1).BorderColor(Navy).Padding(4).Column(column =>
        {
            column.Item().Text(label.ToUpperInvariant()).FontSize(5.5f).FontColor("#64748B");
            column.Item().Text(value).SemiBold().FontSize(6.5f);
        });
    }

    private static string BuildSvg(SitePlanCanvasInput canvas)
    {
        var builder = new StringBuilder();
        builder.Append($"<svg xmlns='http://www.w3.org/2000/svg' width='{canvas.Width}' height='{canvas.Height}' viewBox='0 0 {canvas.Width} {canvas.Height}'>");
        builder.Append("<rect width='100%' height='100%' fill='#FFFFFF'/>");
        builder.Append("<defs><filter id='shadow' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='2' stdDeviation='2' flood-color='#0F172A' flood-opacity='.18'/></filter></defs>");
        var types = canvas.EquipmentTypes.ToDictionary(item => item.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var item in canvas.Elements)
        {
            builder.Append("<g");
            if (item.Rotation != 0) builder.Append($" transform='rotate({N(item.Rotation)} {N(item.X + item.Width / 2)} {N(item.Y + item.Height / 2)})'");
            builder.Append(">");
            switch (item.Type)
            {
                case "rect":
                    builder.Append($"<rect x='{N(item.X)}' y='{N(item.Y)}' width='{N(item.Width)}' height='{N(item.Height)}' rx='2' fill='{Color(item.Fill, "#FFFFFF")}' stroke='{Color(item.Stroke, Navy)}' stroke-width='{N(item.StrokeWidth)}'/>");
                    if (!string.IsNullOrWhiteSpace(item.Text)) CenteredText(builder, item, item.Text!);
                    break;
                case "line":
                    builder.Append($"<line x1='{N(item.X)}' y1='{N(item.Y)}' x2='{N(item.X + item.Width)}' y2='{N(item.Y + item.Height)}' stroke='{Color(item.Stroke, Navy)}' stroke-width='{N(item.StrokeWidth)}' stroke-linecap='round'/>");
                    break;
                case "door":
                    builder.Append($"<line x1='{N(item.X)}' y1='{N(item.Y)}' x2='{N(item.X + item.Width)}' y2='{N(item.Y)}' stroke='{Color(item.Stroke, Navy)}' stroke-width='{N(item.StrokeWidth)}'/>");
                    builder.Append($"<path d='M {N(item.X)} {N(item.Y)} A {N(Math.Abs(item.Width))} {N(Math.Abs(item.Height))} 0 0 1 {N(item.X + item.Width)} {N(item.Y + item.Height)}' fill='none' stroke='#94A3B8' stroke-width='2' stroke-dasharray='5 4'/>");
                    break;
                case "text":
                    builder.Append($"<text x='{N(item.X)}' y='{N(item.Y)}' fill='{Color(item.Fill, Navy)}' font-family='Lato' font-size='{N(Math.Clamp(item.Height, 12, 48))}' font-weight='700'>{Xml(item.Text ?? "Alan etiketi")}</text>");
                    break;
                case "station" when item.EquipmentTypeId is not null && types.TryGetValue(item.EquipmentTypeId, out var type):
                    builder.Append($"<g transform='translate({N(item.X)} {N(item.Y)})' filter='url(#shadow)'>");
                    builder.Append(EquipmentShape(type.Shape, type.Color, item.Width, item.Height));
                    builder.Append($"<text x='{N(item.Width / 2)}' y='{N(item.Height / 2 + 4)}' text-anchor='middle' fill='#FFFFFF' font-family='Lato' font-size='{N(Math.Max(9, item.Height * .32m))}' font-weight='800'>{Xml(type.Code)}</text></g>");
                    builder.Append($"<text x='{N(item.X + item.Width + 4)}' y='{N(item.Y + item.Height / 2 + 4)}' fill='{Navy}' font-family='Lato' font-size='12' font-weight='700'>{Xml(item.StationNumber ?? "-")}</text>");
                    break;
            }
            builder.Append("</g>");
        }
        builder.Append("</svg>");
        return builder.ToString();
    }

    private static void CenteredText(StringBuilder builder, SitePlanElementInput item, string text) => builder.Append(
        $"<text x='{N(item.X + item.Width / 2)}' y='{N(item.Y + item.Height / 2 + 5)}' text-anchor='middle' fill='{Navy}' font-family='Lato' font-size='15' font-weight='700'>{Xml(text)}</text>");

    private static string EquipmentSymbol(string shape, string color, string code) =>
        $"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'>{EquipmentShape(shape, color, 40, 40)}<text x='20' y='25' text-anchor='middle' fill='#fff' font-family='Lato' font-size='14' font-weight='800'>{Xml(code)}</text></svg>";

    private static string EquipmentShape(string shape, string color, decimal width, decimal height)
    {
        color = Color(color, "#2563EB");
        var centerX = width / 2;
        var centerY = height / 2;
        return shape switch
        {
            "circle" => $"<ellipse cx='{N(centerX)}' cy='{N(centerY)}' rx='{N(width / 2)}' ry='{N(height / 2)}' fill='{color}' stroke='#FFFFFF' stroke-width='2'/>",
            "diamond" => $"<polygon points='{N(centerX)},0 {N(width)},{N(centerY)} {N(centerX)},{N(height)} 0,{N(centerY)}' fill='{color}' stroke='#FFFFFF' stroke-width='2'/>",
            "star" => $"<polygon points='{StarPoints(width, height)}' fill='{color}' stroke='#FFFFFF' stroke-width='2'/>",
            "hexagon" => $"<polygon points='{N(width * .25m)},0 {N(width * .75m)},0 {N(width)},{N(centerY)} {N(width * .75m)},{N(height)} {N(width * .25m)},{N(height)} 0,{N(centerY)}' fill='{color}' stroke='#FFFFFF' stroke-width='2'/>",
            _ => $"<rect width='{N(width)}' height='{N(height)}' rx='4' fill='{color}' stroke='#FFFFFF' stroke-width='2'/>",
        };
    }

    private static string StarPoints(decimal width, decimal height)
    {
        var points = new List<string>();
        for (var index = 0; index < 10; index++)
        {
            var angle = -Math.PI / 2 + index * Math.PI / 5;
            var radius = index % 2 == 0 ? .5 : .22;
            points.Add($"{N(width / 2 + (decimal)Math.Cos(angle) * width * (decimal)radius)},{N(height / 2 + (decimal)Math.Sin(angle) * height * (decimal)radius)}");
        }
        return string.Join(' ', points);
    }

    private static string N(decimal value) => value.ToString("0.###", CultureInfo.InvariantCulture);
    private static string Color(string? value, string fallback) =>
        value is not null && Regex.IsMatch(value, "^#[0-9A-Fa-f]{6}$", RegexOptions.CultureInvariant) ? value : fallback;
    private static string Xml(string value) => WebUtility.HtmlEncode(value);
}
