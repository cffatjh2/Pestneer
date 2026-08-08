using System.Net;
using System.Text;
using System.Text.Json;
using Pesneer.Api.Domain;

namespace Pesneer.Api.Quality;

internal static class QualityDocumentRenderer
{
    public static byte[] Render(QualityAnalysis analysis)
    {
        using var payload = JsonDocument.Parse(analysis.PayloadJson);
        var root = payload.RootElement;
        var location = analysis.CustomerBranch?.Name ?? analysis.Customer.LegalName;
        var content = analysis.AnalysisType == "Trend"
            ? RenderTrend(root)
            : RenderRisk(root);

        var html = $$$"""
        <!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>{{{E(analysis.Number)}}} - {{{E(analysis.Title)}}}</title>
        <style>
        @page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;background:#eef4f9;color:#10233f;font:14px Arial,sans-serif}.sheet{width:210mm;min-height:297mm;margin:18px auto;background:#fff;padding:17mm;box-shadow:0 18px 50px #16375c26}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:3px solid #18b88f;padding-bottom:18px}.brand{font-size:27px;font-weight:800}.brand b{color:#1475d1}.tag{font-size:11px;letter-spacing:1.4px;color:#56718d}.number{text-align:right}.number strong{display:block;font-size:16px}.hero{display:grid;grid-template-columns:1fr 140px;gap:20px;margin:24px 0}.hero h1{font-size:27px;margin:4px 0 8px}.score{border-radius:18px;background:linear-gradient(145deg,#0b3c70,#1475d1);color:white;padding:20px;text-align:center}.score strong{font-size:35px;display:block}.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:18px 0}.meta div,.panel{border:1px solid #dce7f0;border-radius:12px;padding:12px}.meta span,.panel h3{display:block;color:#6d8298;font-size:11px;text-transform:uppercase;letter-spacing:.8px;margin:0 0 5px}.panel{margin:14px 0}.panel p{line-height:1.65;white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}th{background:#edf6fb;color:#38536e;text-align:left}th,td{border:1px solid #dce7f0;padding:9px}.risk-high{color:#c62929}.risk-medium{color:#d97706}.risk-low{color:#138260}.footer{margin-top:24px;padding-top:14px;border-top:1px solid #dce7f0;color:#71869a;font-size:10px;display:flex;justify-content:space-between}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}}
        </style></head><body><main class="sheet"><header class="header"><div><div class="brand"><b>Pest</b>neer</div><div class="tag">AKILLI İŞLETME YÖNETİM PLATFORMU</div></div><div class="number"><span class="tag">BELGE NUMARASI</span><strong>{{{E(analysis.Number)}}}</strong><small>{{{analysis.CreatedAt:dd.MM.yyyy HH:mm}}}</small></div></header>
        <section class="hero"><div><span class="tag">{{{(analysis.AnalysisType == "Trend" ? "CANLI YAKALAMA & SAHA TRENDİ" : "HAŞERE YÖNETİMİ RİSK DEĞERLENDİRMESİ")}}}</span><h1>{{{E(analysis.Title)}}}</h1><p>{{{E(analysis.Summary)}}}</p></div><div class="score"><span>{{{(analysis.AnalysisType == "Trend" ? "AKTİVİTE" : "RİSK PUANI")}}}</span><strong>{{{(analysis.Score?.ToString() ?? "—")}}}</strong><small>{{{E(analysis.Level ?? "Bilgilendirme")}}}</small></div></section>
        <section class="meta"><div><span>Müşteri</span><strong>{{{E(analysis.Customer.LegalName)}}}</strong></div><div><span>Lokasyon</span><strong>{{{E(location)}}}</strong></div><div><span>Dönem</span><strong>{{{analysis.PeriodStart:dd.MM.yyyy}}} – {{{analysis.PeriodEnd:dd.MM.yyyy}}}</strong></div><div><span>Hazırlayan</span><strong>{{{E(analysis.CreatedByAccount.DisplayName)}}}</strong></div></section>
        {{{content}}}
        {{{Panel("Saha Bulguları", analysis.Findings)}}}{{{Panel("Öneriler ve Düzeltici Faaliyetler", analysis.Recommendations)}}}
        <footer class="footer"><span>Bu belge Pestneer tarafından dijital kayıtlar üzerinden oluşturulmuştur.</span><span>İzlenebilir kayıt · {{{E(analysis.TemplateCode)}}}</span></footer></main></body></html>
        """;
        return Encoding.UTF8.GetBytes(html);
    }

    private static string RenderTrend(JsonElement root)
    {
        var rows = new StringBuilder();
        if (root.TryGetProperty("periods", out var periods))
        {
            foreach (var item in periods.EnumerateArray())
            {
                rows.Append($"<tr><td>{E(Text(item, "period"))}</td><td>{Text(item, "reportCount")}</td><td>{Text(item, "totalStations")}</td><td>{Text(item, "activeStations")}</td><td>{Text(item, "plateChanges")}</td><td>{Text(item, "totalCaught")}</td><td>%{Text(item, "activityRate")}</td></tr>");
            }
        }

        var pests = new StringBuilder();
        if (root.TryGetProperty("pestTotals", out var pestTotals))
        {
            foreach (var item in pestTotals.EnumerateArray())
            {
                pests.Append($"<tr><td>{E(Text(item, "pest"))}</td><td>{Text(item, "totalCaught")}</td></tr>");
            }
        }

        return $"<section class='panel'><h3>Dönemsel İstasyon Sonuçları</h3><table><thead><tr><th>Dönem</th><th>Rapor</th><th>İstasyon</th><th>Aktivite</th><th>Plaka Değişimi</th><th>Yakalama</th><th>Aktivite Oranı</th></tr></thead><tbody>{rows}</tbody></table></section><section class='panel'><h3>Gözlemlenen Zararlı Dağılımı</h3><table><thead><tr><th>Zararlı</th><th>Toplam Gözlem / Yakalama</th></tr></thead><tbody>{pests}</tbody></table></section>";
    }

    private static string RenderRisk(JsonElement root)
    {
        var rows = new StringBuilder();
        if (root.TryGetProperty("answers", out var answers))
        {
            foreach (var item in answers.EnumerateArray())
            {
                var score = Text(item, "score");
                rows.Append($"<tr><td>{E(Text(item, "category"))}</td><td>{E(Text(item, "question"))}</td><td>{score}/4</td><td>{E(Text(item, "note"))}</td></tr>");
            }
        }

        var weather = root.TryGetProperty("weatherRiskScore", out var weatherScore) ? weatherScore.ToString() : "—";
        var structural = root.TryGetProperty("structuralRiskScore", out var structuralScore) ? structuralScore.ToString() : "—";
        return $"<section class='meta'><div><span>Yapısal / Operasyonel Risk</span><strong>{structural}/100</strong></div><div><span>Konuma Bağlı Hava Riski</span><strong>{weather}/100</strong></div></section><section class='panel'><h3>Risk Kontrol Formu</h3><table><thead><tr><th>Bölüm</th><th>Kontrol Noktası</th><th>Risk</th><th>Açıklama</th></tr></thead><tbody>{rows}</tbody></table></section>";
    }

    private static string Panel(string title, string? value) => string.IsNullOrWhiteSpace(value) ? string.Empty : $"<section class='panel'><h3>{E(title)}</h3><p>{E(value)}</p></section>";
    private static string Text(JsonElement item, string property) => item.TryGetProperty(property, out var value) ? value.ToString() : string.Empty;
    private static string E(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);
}
