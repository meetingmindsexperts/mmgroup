// CORS handling for cross-origin requests from Webflow

export function corsHeaders(origin: string, allowedOrigin: string): HeadersInit {
  // Allow the configured origin, Webflow staging, or localhost for development
  const isAllowed =
    origin === allowedOrigin ||
    origin === 'https://meetingmindsgroup.webflow.io' ||
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCors(request: Request, allowedOrigin: string): Response | null {
  const origin = request.headers.get('Origin') || '';

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin, allowedOrigin),
    });
  }

  return null;
}

export function addCorsHeaders(
  response: Response,
  request: Request,
  allowedOrigin: string
): Response {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders(origin, allowedOrigin))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
