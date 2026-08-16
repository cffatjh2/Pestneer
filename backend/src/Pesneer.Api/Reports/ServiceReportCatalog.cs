namespace Pesneer.Api.Reports;

public static class ServiceReportCatalog
{
    public static readonly string[] PestTypes =
    [
        "Ev faresi", "Tarla faresi", "Norveç sıçanı", "Çatı sıçanı",
        "Alman hamamböceği", "Doğu hamamböceği", "Amerikan hamamböceği",
        "Karasinek", "Sirke sineği", "Lağım sineği", "Sivrisinek", "Güve",
        "Un biti", "Testere dişli böcek", "Karınca", "Gümüşçün"
    ];

    public static readonly string[] ActivityTypes =
    ["Sighting", "Capture", "Droppings", "Gnawing", "Track", "Nest", "Other"];

    public static readonly string[] EquipmentTypes =
    ["M - Dış alan kemirgen istasyonu", "C - İç alan canlı yakalama istasyonu", "E - Sinek cihazı", "G - Güvenlik monitörü", "B - Böcek monitörü"];

    public static readonly string[] InaccessibilityReasons =
    ["Alan kilitliydi", "Üretim devam ediyordu", "Müşteri erişime izin vermedi", "İstasyonun önü kapalıydı", "İş güvenliği nedeniyle erişilemedi", "İstasyon yerinde bulunamadı"];

    public static readonly string[] ResidenceTypes =
    ["İşyeri", "Gıda üretim tesisi", "Depo / lojistik", "Restoran / kafe", "Otel / konaklama", "Sağlık tesisi", "Eğitim kurumu", "Konut / site", "Açık alan"];

    public static readonly string[] WorkTypes =
    [
        "Kemirgen kontrolü", "Sinek cihazı kontrolü", "Uçan haşere kontrolü",
        "Hamamböceği ve yürüyen haşere kontrolü", "Böcek monitörü kontrolü",
        "Depolanmış ürün zararlıları kontrolü", "Larva ve drenaj kontrolü",
        "Genel biyosidal uygulama", "Dezenfeksiyon", "Acil çağrı / noktasal müdahale",
        "Yapısal risk ve hijyen kontrolü"
    ];

    public static readonly string[] SafetyMeasures =
    [
        "Uygulama alanı bilgilendirildi", "Kişisel koruyucu donanım kullanıldı",
        "Gıda ve temas yüzeyleri koruma altına alındı", "Uygulama alanı sınırlandırıldı",
        "Uyarı levhası yerleştirildi", "Havalandırma sağlandı", "Elektrik / ekipman güvenliği kontrol edildi"
    ];

    public static readonly string[] ApplicationMethods =
    ["Püskürtme", "Jel uygulama", "Yemleme", "ULV / sisleme", "Larvasit uygulama", "Toz uygulama", "İstasyon içine uygulama", "Yapışkan plaka değişimi"];

    public static readonly string[] ProductUnits = ["Litre", "Mililitre", "Kilogram", "Gram", "Adet", "Tüp", "Kutu", "Paket"];

    public static bool IsKnownOrOther(string? value, IReadOnlyCollection<string> catalog)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;
        var trimmed = value.Trim();
        return catalog.Contains(trimmed, StringComparer.OrdinalIgnoreCase) ||
               trimmed.Equals("Diğer", StringComparison.OrdinalIgnoreCase) ||
               trimmed.Equals("Diger", StringComparison.OrdinalIgnoreCase) ||
               trimmed.Equals("Other", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Diğer:", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Diğer: ", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Diger:", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Diger: ", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Other:", StringComparison.OrdinalIgnoreCase) ||
               trimmed.StartsWith("Other: ", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsKnownList(string? value, IReadOnlyCollection<string> catalog) =>
        string.IsNullOrWhiteSpace(value) || value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .All(item => IsKnownOrOther(item, catalog));
}

public sealed record ServiceReportCatalogResponse(
    IReadOnlyList<string> PestTypes,
    IReadOnlyList<string> ActivityTypes,
    IReadOnlyList<string> EquipmentTypes,
    IReadOnlyList<string> InaccessibilityReasons,
    IReadOnlyList<string> ResidenceTypes,
    IReadOnlyList<string> WorkTypes,
    IReadOnlyList<string> SafetyMeasures,
    IReadOnlyList<string> ApplicationMethods,
    IReadOnlyList<string> ProductUnits,
    IReadOnlyList<int> QuickCounts);
