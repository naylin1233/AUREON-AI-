interface Env {
  AUREON_BACKEND_URL: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const configuredOrigin = env.AUREON_BACKEND_URL?.trim();
  if (!configuredOrigin) {
    return Response.json(
      { error: 'AUREON_BACKEND_URL is not configured for this Pages deployment.' },
      { status: 503 }
    );
  }

  let upstreamUrl: URL;
  try {
    const backend = new URL(configuredOrigin);
    if (backend.protocol !== 'https:') {
      return Response.json({ error: 'The backend URL must use HTTPS.' }, { status: 500 });
    }
    const incoming = new URL(request.url);
    upstreamUrl = new URL(incoming.pathname + incoming.search, backend.origin);
  } catch {
    return Response.json({ error: 'AUREON_BACKEND_URL is invalid.' }, { status: 500 });
  }

  const headers = new Headers(request.headers);
  // The browser talks to this same-origin Pages route. The server-to-server
  // hop must not forward the Pages Origin, so the backend's same-origin
  // protection evaluates the request against its own host.
  headers.delete('origin');
  headers.delete('host');

  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : request.body;

  try {
    const upstream = await fetch(new Request(upstreamUrl.toString(), {
      method,
      headers,
      body,
      redirect: 'manual'
    }));

    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-credentials');
    responseHeaders.delete('access-control-allow-headers');
    responseHeaders.delete('access-control-allow-methods');

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch {
    return Response.json(
      { error: 'AUREON backend is temporarily unreachable. Please try again.' },
      { status: 502 }
    );
  }
};
