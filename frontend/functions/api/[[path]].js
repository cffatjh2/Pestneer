const DEFAULT_API_ORIGIN = 'https://api.pestneer.com';
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

export async function onRequest({ request, env }) {
  const apiOrigin = String(env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/, '');
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${apiOrigin}/`);

  if (targetUrl.host === incomingUrl.host) {
    return Response.json({ message: 'API hedefi Pages alan adından farklı olmalıdır.' }, { status: 500 });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': incomingUrl.origin,
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers': request.headers.get('access-control-request-headers') || 'authorization,content-type',
        'access-control-max-age': '86400',
      },
    });
  }

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  const isSafeMethod = request.method === 'GET' || request.method === 'HEAD';
  if (!isSafeMethod) init.body = request.body;

  const maximumAttempts = isSafeMethod ? 3 : 1;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(targetUrl, init);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('content-encoding');
      responseHeaders.delete('content-length');
      responseHeaders.set('access-control-allow-origin', incomingUrl.origin);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch {
      if (attempt === maximumAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  return Response.json(
    { message: 'API servisine şu anda ulaşılamıyor. Lütfen kısa süre sonra yeniden deneyin.' },
    { status: 502 },
  );
}
