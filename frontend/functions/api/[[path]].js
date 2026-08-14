const DEFAULT_API_ORIGIN = 'https://pesneer.onrender.com';

export async function onRequest({ request, env }) {
  const apiOrigin = String(env.API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/, '');
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, `${apiOrigin}/`);

  if (targetUrl.host === incomingUrl.host) {
    return Response.json({ message: 'API hedefi Pages alan adından farklı olmalıdır.' }, { status: 500 });
  }

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incomingUrl.host);
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
  }

  try {
    const response = await fetch(targetUrl, init);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: 'API servisine şu anda ulaşılamıyor. Lütfen kısa süre sonra yeniden deneyin.' },
      { status: 502 },
    );
  }
}
