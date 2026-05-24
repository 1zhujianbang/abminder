/**
 * Finnhub API proxy — appends API key server-side
 * https://domain.com/api/finnhub?path=news?category=general
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const apiPath = url.searchParams.get('path');

  if (!apiPath) {
    return new Response('Missing path param', { status: 400 });
  }

  const FINNHUB_KEY = context.env.FINNHUB_KEY || 'd898p41r01qla01mj11gd898p41r01qla01mj120';
  const targetUrl = `https://finnhub.io/api/v1/${apiPath}&token=${FINNHUB_KEY}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
      },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502 });
  }
}
