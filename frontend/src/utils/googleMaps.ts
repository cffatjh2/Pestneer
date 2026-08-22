import { apiFetch } from '../services/apiBase';

type GoogleMapsRuntime = {
  maps: Record<string, unknown> & {
    Map: new (...args: unknown[]) => unknown;
    Marker: new (...args: unknown[]) => unknown;
    InfoWindow: new (...args: unknown[]) => unknown;
    Polyline: new (...args: unknown[]) => unknown;
    LatLngBounds: new (...args: unknown[]) => unknown;
    SymbolPath: { CIRCLE: unknown };
    event: { clearInstanceListeners: (instance: unknown) => void };
    places?: Record<string, unknown>;
    importLibrary?: (name: string) => Promise<Record<string, unknown>>;
  };
};

declare global {
  interface Window {
    google?: GoogleMapsRuntime;
    __pesneerGoogleMapsReady?: () => void;
  }
}
let mapsPromise: Promise<GoogleMapsRuntime> | undefined;

export const googleMapsConfigured = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());
export const googleMapsMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim();

export type GoogleMapsQuotaMetric = 'dynamic_maps' | 'autocomplete_requests' | 'place_details' | 'geocoding';

function currentAccessToken() {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem('pesneer.session');
      if (!raw) continue;
      const token = JSON.parse(raw)?.accessToken;
      if (typeof token === 'string' && token) return token;
    } catch { /* An unreadable legacy session is treated as unauthenticated. */ }
  }
  return undefined;
}

export async function acquireGoogleMapsQuota(metric: GoogleMapsQuotaMetric, units = 1) {
  const accessToken = currentAccessToken();
  if (!accessToken) throw new Error('Harita kotası doğrulanamadı. Lütfen yeniden giriş yapın.');
  const response = await apiFetch('/api/maps/quota/acquire', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ metric, units }),
  });
  if (response.status === 429)
    throw new Error('Aylık ücretsiz Google Maps kotası doldu. Bağlantı ve koordinat girişi kullanılabilir.');
  if (!response.ok) throw new Error('Harita kotası güvenli biçimde doğrulanamadı.');
  return response.json() as Promise<{ allowed: boolean; remaining: number; limit: number; period: string }>;
}

export function loadGoogleMaps(): Promise<GoogleMapsRuntime> {
  if (window.google?.maps) return Promise.resolve(window.google);
  if (mapsPromise) return mapsPromise;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return Promise.reject(new Error('Google Maps anahtarı tanımlı değil.'));

  mapsPromise = new Promise<GoogleMapsRuntime>((resolve, reject) => {
    const callbackName = '__pesneerGoogleMapsReady';
    window[callbackName] = () => {
      if (!window.google?.maps) return reject(new Error('Google Maps yüklenemedi.'));
      resolve(window.google);
      delete window[callbackName];
    };
    const script = document.createElement('script');
    const params = new URLSearchParams({
      key: apiKey,
      callback: callbackName,
      loading: 'async',
      libraries: 'places,marker',
      language: 'tr',
      region: 'TR',
      v: 'weekly',
      auth_referrer_policy: 'origin',
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      mapsPromise = undefined;
      reject(new Error('Google Maps bağlantısı kurulamadı.'));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export function googleMapsUrl(latitude?: number, longitude?: number, fallback?: string) {
  if (latitude != null && longitude != null)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  return fallback ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallback)}` : 'https://maps.google.com';
}

export function coordinatesFromGoogleMapsUrl(value: string) {
  const decoded = decodeURIComponent(value.trim());
  const match = decoded.match(/@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/)
    ?? decoded.match(/[?&](?:query|q|ll)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i)
    ?? decoded.match(/(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (!match) return undefined;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
    ? { latitude, longitude }
    : undefined;
}
