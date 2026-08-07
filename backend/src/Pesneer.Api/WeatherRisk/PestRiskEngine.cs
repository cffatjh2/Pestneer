namespace Pesneer.Api.WeatherRisk;

public static class PestRiskEngine
{
    public static (RiskSummaryResponse Summary, IReadOnlyList<PestRiskResponse> Pests) Calculate(WeatherReading weather)
    {
        var maximum = weather.Forecast.Count == 0 ? weather.TemperatureC : weather.Forecast.Max(item => item.MaximumTemperatureC);
        var minimum = weather.Forecast.Count == 0 ? weather.TemperatureC : weather.Forecast.Min(item => item.MinimumTemperatureC);
        var rain = weather.Forecast.Sum(item => item.PrecipitationMm);
        var rainProbability = weather.Forecast.Count == 0 ? 0 : weather.Forecast.Max(item => item.PrecipitationProbability);
        var pests = new[]
        {
            Cockroach(weather, maximum, rain),
            Mosquito(weather, maximum, rain, rainProbability),
            HouseFly(weather, maximum, rain),
            Rodent(minimum, rain),
            Ant(weather, maximum, rain),
            StoredProduct(weather, maximum)
        }.OrderByDescending(item => item.Score).ToArray();
        var score = pests.Max(item => item.Score);
        return (new RiskSummaryResponse(score, Level(score), score >= 65 ? "Önleyici kontrol önerilir" : score >= 35 ? "Yakın takip önerilir" : "Rutin takip yeterli"), pests);
    }

    private static PestRiskResponse Cockroach(WeatherReading weather, decimal maximum, decimal rain)
    {
        var score = 10; var reasons = new List<string>();
        if (maximum >= 25) { score += 35; reasons.Add("25 °C üzerindeki sıcaklıklar hamamböceği aktivitesi için elverişlidir."); }
        else if (maximum >= 20) { score += 20; reasons.Add("Ilıman sıcaklıklar iç alan aktivitesini destekleyebilir."); }
        if (weather.RelativeHumidity >= 60) { score += 20; reasons.Add("Yüksek bağıl nem barınma ve su kaynaklarını destekler."); }
        if (rain >= 5) { score += 10; reasons.Add("Yağış sonrası gider ve nemli alan baskısı artabilir."); }
        return Pest("cockroach", "Hamamböceği", score, reasons, ["Gider, sıcak motor bölgesi ve gıda hazırlık alanlarını kontrol edin.", "Su sızıntılarını giderin; jel yem ve yapışkan izleme noktalarını doğrulayın."]);
    }

    private static PestRiskResponse Mosquito(WeatherReading weather, decimal maximum, decimal rain, int probability)
    {
        var score = 5; var reasons = new List<string>();
        if (maximum is >= 20 and <= 30) { score += 35; reasons.Add("20-30 °C aralığı sivrisinek gelişimi ve aktivitesi için elverişlidir."); }
        else if (maximum > 30) { score += 18; reasons.Add("Sıcak hava erişkin sivrisinek aktivitesini sürdürebilir."); }
        if (weather.RelativeHumidity >= 60) { score += 15; reasons.Add("Yüksek nem erişkin aktivitesini destekleyebilir."); }
        if (rain is > 0 and <= 30 || probability >= 50) { score += 25; reasons.Add("Yağış ve su birikimi yeni üreme odakları oluşturabilir."); }
        else if (rain > 30) { score += 10; reasons.Add("Yoğun yağış sonrasında kalan durgun sular izlenmelidir."); }
        return Pest("mosquito", "Sivrisinek", score, reasons, ["Oluk, saksı altlığı ve açık su kaplarında durgun su bırakmayın.", "Yağıştan 3-7 gün sonra larva odak kontrolü planlayın."]);
    }

    private static PestRiskResponse HouseFly(WeatherReading weather, decimal maximum, decimal rain)
    {
        var score = 8; var reasons = new List<string>();
        if (maximum >= 24) { score += 38; reasons.Add("24 °C üzerindeki sıcaklıklar sinek gelişimini hızlandırabilir."); }
        else if (maximum >= 18) { score += 20; reasons.Add("Ilıman hava uçkun aktivitesini destekleyebilir."); }
        if (weather.RelativeHumidity is >= 40 and <= 80) { score += 10; reasons.Add("Orta-yüksek nem organik üreme ortamlarını destekleyebilir."); }
        if (rain is > 0 and <= 15) { score += 10; reasons.Add("Hafif yağış sonrası nemli organik atık alanları risk oluşturabilir."); }
        return Pest("house-fly", "Karasinek", score, reasons, ["Çöp alanlarında kapak, temizlik sıklığı ve drenajı kontrol edin.", "Kapı-pencere sineklikleri ile UV cihaz kayıtlarını gözden geçirin."]);
    }

    private static PestRiskResponse Rodent(decimal minimum, decimal rain)
    {
        var score = 12; var reasons = new List<string>();
        if (minimum <= 5) { score += 40; reasons.Add("Soğuk hava kemirgenlerin korunaklı iç alan arayışını artırabilir."); }
        else if (minimum <= 10) { score += 28; reasons.Add("Düşük gece sıcaklığı iç alana giriş baskısını artırabilir."); }
        if (rain >= 10) { score += 20; reasons.Add("Kuvvetli yağış yuva ve geçiş alanlarını etkileyebilir."); }
        return Pest("rodent", "Kemirgen", score, reasons, ["Kapı altları, boru geçişleri ve dış cephe açıklıklarını kontrol edin.", "Dış alan istasyonlarını ve yem tüketim kayıtlarını doğrulayın."]);
    }

    private static PestRiskResponse Ant(WeatherReading weather, decimal maximum, decimal rain)
    {
        var score = 8; var reasons = new List<string>();
        if (maximum >= 22) { score += 28; reasons.Add("Sıcak hava karınca hareketliliğini artırabilir."); }
        if (rain <= 2) { score += 15; reasons.Add("Kuru koşullar su ve gıda arayışını artırabilir."); }
        if (weather.RelativeHumidity is >= 35 and <= 70) score += 8;
        return Pest("ant", "Karınca", score, reasons, ["Dış cephe çatlakları, peyzaj teması ve şekerli gıda alanlarını kontrol edin."]);
    }

    private static PestRiskResponse StoredProduct(WeatherReading weather, decimal maximum)
    {
        var score = 8; var reasons = new List<string>();
        if (maximum >= 25) { score += 32; reasons.Add("Yüksek sıcaklık depo zararlılarının gelişimini hızlandırabilir."); }
        if (weather.RelativeHumidity >= 60) { score += 25; reasons.Add("Yüksek nem ürün ve ambalaj çevresinde uygun mikroiklim oluşturabilir."); }
        return Pest("stored-product", "Depo zararlıları", score, reasons, ["FIFO, ambalaj bütünlüğü ve döküntü temizliğini doğrulayın.", "Feromon tuzaklarını ve ürün kabul alanını kontrol edin."]);
    }

    private static PestRiskResponse Pest(string code, string name, int score, IReadOnlyList<string> reasons, IReadOnlyList<string> recommendations)
    {
        score = Math.Clamp(score, 0, 100);
        return new PestRiskResponse(code, name, score, Level(score), reasons.Count == 0 ? ["Belirgin meteorolojik tetikleyici görülmedi."] : reasons, recommendations);
    }

    private static string Level(int score) => score >= 65 ? "High" : score >= 35 ? "Medium" : "Low";
}
