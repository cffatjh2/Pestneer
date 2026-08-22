const PRODUCTION_API_ORIGIN = 'https://api.pestneer.com';
const CACHEABLE_PATHS = ['/api/v2/', '/api/company/dashboard'];
const MAX_CACHE_ENTRIES = 40;
const MAX_CACHE_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const FRESH_CACHE_MS = 15_000;
const STALE_CACHE_MS = 5 * 60_000;

type ResponseSnapshot = {
  body: ArrayBuffer;
  headers: [string, string][];
  status: number;
  statusText: string;
  etag?: string;
  storedAt: number;
  lastAccessedAt: number;
};

const inFlightGets = new Map<string, Promise<Response>>();
const responseCache = new Map<string, ResponseSnapshot>();
let responseCacheBytes = 0;

export function resolveApiOrigin(): string {
  const configured = String(import.meta.env.VITE_API_ORIGIN ?? '').trim().replace(/\/$/, '');
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (!isLocal) return PRODUCTION_API_ORIGIN;
  }

  return '';
}

export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = resolveApiOrigin();
  return origin ? `${origin}${path.startsWith('/') ? path : `/${path}`}` : path;
}

export function invalidateApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    responseCache.clear();
    responseCacheBytes = 0;
    return;
  }

  for (const [key, value] of responseCache) {
    if (!key.includes(pathPrefix)) continue;
    responseCache.delete(key);
    responseCacheBytes -= value.body.byteLength;
  }
}

function isUsableApiResponse(response: Response): boolean {
  if (response.status === 204 || response.status === 304 || response.status === 401 || response.status === 403) return true;
  const type = (response.headers.get('content-type') ?? '').toLowerCase();
  return !type.includes('text/html');
}

function isSafeMethod(method: string) {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

function isCacheablePath(path: string) {
  if (/^https?:\/\//i.test(path)) {
    try { return CACHEABLE_PATHS.some((prefix) => new URL(path).pathname.startsWith(prefix)); }
    catch { return false; }
  }
  return CACHEABLE_PATHS.some((prefix) => path.startsWith(prefix));
}

async function requestScope(headers: Headers) {
  const authorization = headers.get('authorization');
  if (!authorization) return 'anonymous';
  // Authorized responses must never share an anonymous cache key on older/in-app browsers.
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization));
  return Array.from(new Uint8Array(digest).slice(0, 12), (value) => value.toString(16).padStart(2, '0')).join('');
}

function responseFromSnapshot(snapshot: ResponseSnapshot) {
  snapshot.lastAccessedAt = Date.now();
  return new Response(snapshot.body.slice(0), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: snapshot.headers,
  });
}

function evictCache() {
  const now = Date.now();
  for (const [key, value] of responseCache) {
    if (now - value.storedAt <= STALE_CACHE_MS) continue;
    responseCache.delete(key);
    responseCacheBytes -= value.body.byteLength;
  }

  while (responseCache.size > MAX_CACHE_ENTRIES || responseCacheBytes > MAX_CACHE_BYTES) {
    const oldest = [...responseCache.entries()].sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)[0];
    if (!oldest) break;
    responseCache.delete(oldest[0]);
    responseCacheBytes -= oldest[1].body.byteLength;
  }
}

async function storeResponse(key: string, response: Response) {
  if (!response.ok || response.headers.get('cache-control')?.toLowerCase().includes('no-store')) return;
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_CACHE_ENTRY_BYTES) return;

  const body = await response.clone().arrayBuffer();
  if (body.byteLength > MAX_CACHE_ENTRY_BYTES) return;

  const previous = responseCache.get(key);
  if (previous) responseCacheBytes -= previous.body.byteLength;
  const now = Date.now();
  responseCache.set(key, {
    body,
    headers: [...response.headers.entries()],
    status: response.status,
    statusText: response.statusText,
    etag: response.headers.get('etag') ?? undefined,
    storedAt: now,
    lastAccessedAt: now,
  });
  responseCacheBytes += body.byteLength;
  evictCache();
}

async function fetchWithSafeFallback(path: string, primary: string, init: RequestInit, safe: boolean) {
  // Fallback is only a local/same-origin proxy escape hatch. An explicitly configured
  // preview or staging origin must never forward its Authorization header to production.
  const canFallbackToProduction = safe && !/^https?:\/\//i.test(primary) && !/^https?:\/\//i.test(path);
  try {
    const response = await fetch(primary, init);
    if (isUsableApiResponse(response)) return response;
    if (!canFallbackToProduction) throw new Error('API beklenmeyen bir yanıt döndürdü; işlem güvenlik için tekrar gönderilmedi.');
  } catch (error) {
    if (!canFallbackToProduction) {
      throw error instanceof Error ? error : new Error('API servisine ulaşılamıyor.');
    }
  }

  const fallback = `${PRODUCTION_API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  if (fallback === primary) throw new Error('API servisine ulaşılamıyor. Lütfen kısa süre sonra yeniden deneyin.');
  return fetch(fallback, init);
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const safe = isSafeMethod(method);
  const primary = apiUrl(path);
  const headers = new Headers(init.headers);
  const scope = await requestScope(headers);
  const cacheable = method === 'GET' && scope !== undefined && isCacheablePath(path);
  const key = `${scope ?? 'uncacheable-authorized'}:${headers.get('accept') ?? ''}:${primary}`;
  const cached = cacheable ? responseCache.get(key) : undefined;
  const now = Date.now();

  if (cached && now - cached.storedAt <= FRESH_CACHE_MS) return responseFromSnapshot(cached);
  if (cached?.etag && !headers.has('if-none-match')) headers.set('if-none-match', cached.etag);

  const requestInit = { ...init, method, headers };
  const execute = async () => {
    const response = await fetchWithSafeFallback(path, primary, requestInit, safe);
    if (response.status === 304 && cached) return responseFromSnapshot(cached);
    if (cacheable) await storeResponse(key, response);
    if (!safe && response.ok) invalidateApiCache();
    return response;
  };

  if (method !== 'GET' || init.signal || scope === undefined) return execute();

  let pending = inFlightGets.get(key);
  if (!pending) {
    pending = execute().finally(() => inFlightGets.delete(key));
    inFlightGets.set(key, pending);
  }
  return (await pending).clone();
}
