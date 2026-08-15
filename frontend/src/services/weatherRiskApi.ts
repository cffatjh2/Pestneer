import { apiFetch } from './apiBase';

export type ForecastDay = {
  date: string;
  minimumTemperatureC: number;
  maximumTemperatureC: number;
  precipitationMm: number;
  precipitationProbability: number;
};

export type WeatherSnapshot = {
  temperatureC: number;
  apparentTemperatureC: number;
  relativeHumidity: number;
  precipitationMm: number;
  windSpeedKmh: number;
  weatherCode: number;
  condition: string;
  observedAt: string;
  isStale: boolean;
  forecast: ForecastDay[];
};

export type PestRisk = {
  code: string;
  name: string;
  score: number;
  level: 'Low' | 'Medium' | 'High';
  reasons: string[];
  recommendations: string[];
};

export type LocationWeatherRisk = {
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName: string;
  address: string;
  mapUrl?: string;
  latitude?: number;
  longitude?: number;
  locationType: 'Customer' | 'Branch';
  unavailableReason?: string;
  weather?: WeatherSnapshot;
  risk?: { score: number; level: 'Low' | 'Medium' | 'High'; label: string };
  pests: PestRisk[];
};

export type WeatherRiskOverview = {
  generatedAt: string;
  totalLocations: number;
  highRiskLocations: number;
  locations: LocationWeatherRisk[];
  disclaimer: string;
};

export class WeatherRiskSessionExpiredError extends Error {
  constructor() { super('Oturum süresi doldu.'); this.name = 'WeatherRiskSessionExpiredError'; }
}

export const getCompanyWeatherRisks = (token: string, forceRefresh = false) =>
  request(`/api/company/weather-risks?forceRefresh=${forceRefresh}`, token);

export const getCustomerWeatherRisks = (token: string, forceRefresh = false) =>
  request(`/api/customer/portal/weather-risks?forceRefresh=${forceRefresh}`, token);

async function request(path: string, token: string): Promise<WeatherRiskOverview> {
  let response: Response;
  try { response = await apiFetch(path, { headers: { Authorization: `Bearer ${token}` } }); }
  catch { throw new Error('Hava ve risk servisine ulaşılamıyor.'); }
  if (response.status === 401 || response.status === 403) throw new WeatherRiskSessionExpiredError();
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    throw new Error(problem?.message ?? problem?.detail ?? 'Hava ve risk bilgileri alınamadı.');
  }
  return response.json() as Promise<WeatherRiskOverview>;
}
