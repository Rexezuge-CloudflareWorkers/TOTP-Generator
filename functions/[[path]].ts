interface PagesEnv {
  API_WORKER: Fetcher;
}

const FORWARDED_HOST_HEADER = 'X-Forwarded-Host';
const FORWARDED_PROTO_HEADER = 'X-Forwarded-Proto';
const FORWARDED_URI_HEADER = 'X-Forwarded-Uri';

export const onRequest: PagesFunction<PagesEnv> = async ({ request, env }) => {
  const originalUrl = new URL(request.url);

  const headers = new Headers(request.headers);
  headers.set(FORWARDED_HOST_HEADER, originalUrl.host);
  headers.set(FORWARDED_PROTO_HEADER, originalUrl.protocol.replace(':', ''));
  headers.set(FORWARDED_URI_HEADER, `${originalUrl.pathname}${originalUrl.search}`);

  const proxyRequest = new Request(originalUrl.toString(), {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: request.redirect,
  });

  return env.API_WORKER.fetch(proxyRequest);
};
