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
