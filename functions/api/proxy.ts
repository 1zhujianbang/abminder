/**
 * Generic CORS proxy for external APIs
 * https://domain.com/api/proxy?url=https://push2his.eastmoney.com/...
 *
 * Only allows specific hosts for security.
 */
const ALLOWED_HOSTS = [
  'query1.finance.yahoo.com',
  'push2his.eastmoney.com',
  'push2.eastmoney.com',
  'stooq.com',
  'api.nasdaq.com',
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrlStr = url.searchParams.get('url');

  if (!targetUrlStr) {
    return new Response('Missing url param', { status: 400 });
  }

  let parsed;
  try {
    parsed = new URL(targetUrlStr);
    if (!ALLOWED_HOSTS.includes(parsed.host)) {
      return new Response('Host not allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid url', { status: 400 });
  }

  try {
    const res = await fetch(targetUrlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.nasdaq.com/',
      },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (e) {
    return new Response(e.message, { status: 502 });
  }
}
