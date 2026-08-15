const PRODUCTION_API_ORIGIN = 'https://pesneer.onrender.com';

export function resolveApiOrigin(): string {
  const configured = String(import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.pages.dev') || host.endsWith('.vercel.app')) {
      return PRODUCTION_API_ORIGIN;
    }
  }

  return '';
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = resolveApiOrigin();
  return origin ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : path;
}

function isUsableApiResponse(response: Response): boolean {
  if (response.status === 204 || response.status === 401 || response.status === 403) return true;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  return !type.includes('text/html');
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const primary = apiUrl(path);
  try {
    const response = await fetch(primary, init);
    if (isUsableApiResponse(response)) return response;
  } catch (error) {
    if (primary.startsWith(PRODUCTION_API_ORIGIN)) {
      throw error instanceof Error ? error : new Error('API servisine ulaşılamıyor.');
    }
  }

  const fallback = /^https?:\/\//i.test(path)
    ? path
    : `${PRODUCTION_API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  if (fallback === primary) {
    throw new Error('API servisine ulaşılamıyor. Lütfen kısa süre sonra yeniden deneyin.');
  }

  return fetch(fallback, init);
}
