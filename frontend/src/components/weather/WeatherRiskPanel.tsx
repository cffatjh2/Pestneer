import { AlertTriangle, CloudRain, Droplets, ExternalLink, MapPin, RefreshCw, ShieldCheck, ThermometerSun, Wind } from 'lucide-react';
import type { LocationWeatherRisk, WeatherRiskOverview } from '../../services/weatherRiskApi';

export default function WeatherRiskPanel({ overview, loading, error, onRefresh, compact = false }: {
  overview: WeatherRiskOverview | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return <section className={`surface weather-risk-panel ${compact ? 'weather-risk-compact' : ''}`}>
    <div className="weather-risk-heading">
      <div><p className="eyebrow">KONUMA BAĞLI ERKEN UYARI</p><h2>Şube hava durumu & zararlı riski</h2><span>Güncel hava ve 3 günlük tahmine göre açıklanabilir operasyon göstergeleri.</span></div>
      <button className="secondary-button" onClick={onRefresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin-icon' : ''} /> Yenile</button>
    </div>
    {overview?.highRiskLocations ? <div className="weather-risk-alert"><AlertTriangle size={18} /><div><strong>{overview.highRiskLocations} lokasyonda yüksek risk göstergesi</strong><span>Firma ve müşteri portalında önleyici kontrol uyarısı aktif.</span></div></div> : null}
    {loading && !overview ? <WeatherState icon={<RefreshCw className="spin-icon" />} text="Şube hava verileri hazırlanıyor…" /> : error && !overview ? <WeatherState icon={<AlertTriangle />} text={error} /> : overview?.locations.length ? <div className="weather-location-grid">{overview.locations.map((location) => <LocationCard key={`${location.customerId}-${location.branchId ?? 'hq'}`} location={location} />)}</div> : <WeatherState icon={<MapPin />} text="Analiz edilecek şube bulunamadı. Müşteri veya şubeye koordinat ya da Google Haritalar bağlantısı ekleyin." />}
    {overview && <p className="weather-risk-disclaimer"><ShieldCheck size={14} />{overview.disclaimer}</p>}
  </section>;
}

function LocationCard({ location }: { location: LocationWeatherRisk }) {
  if (!location.weather || !location.risk) return <article className="weather-location-card weather-unavailable"><div className="weather-card-title"><span><MapPin size={17} /></span><div><strong>{location.customerName} · {location.branchName}</strong><small>{location.address}</small></div></div><p>{location.unavailableReason}</p>{location.mapUrl && <a href={location.mapUrl} target="_blank" rel="noreferrer">Haritada aç <ExternalLink size={13} /></a>}</article>;
  const topPests = location.pests.slice(0, 3);
  return <article className={`weather-location-card risk-${location.risk.level.toLowerCase()}`}>
    <div className="weather-card-title"><span><MapPin size={17} /></span><div><strong>{location.customerName} · {location.branchName}</strong><small>{location.address}</small></div><em>{riskLabel(location.risk.level)} · {location.risk.score}</em></div>
    <div className="weather-current"><div><ThermometerSun size={22} /><strong>{formatNumber(location.weather.temperatureC)}°</strong><span>{location.weather.condition}{location.weather.isStale ? ' · Son geçerli veri' : ''}</span></div><div className="weather-facts"><span><Droplets size={14} />%{location.weather.relativeHumidity} nem</span><span><CloudRain size={14} />{formatNumber(location.weather.precipitationMm)} mm</span><span><Wind size={14} />{formatNumber(location.weather.windSpeedKmh)} km/sa</span></div></div>
    <div className="weather-forecast">{location.weather.forecast.map((day) => <div key={day.date}><span>{formatDay(day.date)}</span><strong>{formatNumber(day.maximumTemperatureC)}° / {formatNumber(day.minimumTemperatureC)}°</strong><small>%{day.precipitationProbability} yağış</small></div>)}</div>
    <div className="pest-risk-list">{topPests.map((pest) => <details key={pest.code}><summary><span>{pest.name}</span><em className={`risk-pill risk-${pest.level.toLowerCase()}`}>{riskLabel(pest.level)} · {pest.score}</em></summary><p>{pest.reasons[0]}</p><small>{pest.recommendations[0]}</small></details>)}</div>
    <div className="weather-card-footer"><span>{location.risk.label}</span>{location.mapUrl && <a href={location.mapUrl} target="_blank" rel="noreferrer">Harita <ExternalLink size={12} /></a>}</div>
  </article>;
}

function WeatherState({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="weather-risk-state">{icon}<span>{text}</span></div>; }
function riskLabel(level: string) { return level === 'High' ? 'Yüksek' : level === 'Medium' ? 'Orta' : 'Düşük'; }
function formatNumber(value: number) { return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value); }
function formatDay(value: string) { return new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(new Date(`${value}T12:00:00`)); }
