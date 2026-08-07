namespace Pesneer.Api.Inventory;

public static class InventoryUnitConverter
{
    public static bool TryConvert(decimal quantity, string fromUnit, string toUnit, out decimal converted)
    {
        converted = 0;
        if (quantity < 0) return false;
        var from = Normalize(fromUnit);
        var to = Normalize(toUnit);
        if (from == to) { converted = quantity; return true; }

        var fromDefinition = Definition(from);
        var toDefinition = Definition(to);
        if (fromDefinition is null || toDefinition is null || fromDefinition.Value.Family != toDefinition.Value.Family) return false;
        converted = decimal.Round(quantity * fromDefinition.Value.BaseFactor / toDefinition.Value.BaseFactor, 3, MidpointRounding.AwayFromZero);
        return true;
    }

    public static string Normalize(string value) => value.Trim().ToLowerInvariant() switch
    {
        "l" or "lt" or "litre" or "liter" => "Litre",
        "ml" or "mililitre" or "milliliter" => "Mililitre",
        "kg" or "kilogram" => "Kilogram",
        "g" or "gr" or "gram" => "Gram",
        "adet" or "ad" => "Adet",
        "paket" => "Paket",
        "kutu" => "Kutu",
        _ => value.Trim()
    };

    private static (string Family, decimal BaseFactor)? Definition(string unit) => unit switch
    {
        "Litre" => ("volume", 1000m),
        "Mililitre" => ("volume", 1m),
        "Kilogram" => ("mass", 1000m),
        "Gram" => ("mass", 1m),
        "Adet" => ("count", 1m),
        "Paket" => ("package", 1m),
        "Kutu" => ("box", 1m),
        _ => null
    };
}
