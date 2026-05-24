/**
 * NASDAQ historical data proxy (CORS workaround)
 * https://domain.com/api/nasdaq?symbol=AAPL&from=2026-01-01&limit=100
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const symbol = url.searchParams.get('symbol');
  const fromDate = url.searchParams.get('from') || '2026-01-01';
  const limit = url.searchParams.get('limit') || '100';

  if (!symbol) {
    return new Response('Missing symbol', { status: 400 });
  }

  const targetUrl = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/historical?assetclass=stocks&fromdate=${fromDate}&limit=${limit}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.nasdaq.com/',
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
