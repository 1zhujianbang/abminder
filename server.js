/**
 * Remote control server for abminder trading tool.
 * Run: node server.js
 * Then open http://localhost:3456 in your browser.
 */
var http = require('http');
var https = require('https');
var fs = require('fs');
var path = require('path');
var dns = require('dns');

// Fix DNS resolution for Chinese domains (Node.js on Windows may not resolve domestic CDNs)
dns.setServers(['114.114.114.114', '223.5.5.5', '8.8.8.8', '1.1.1.1']);

var PORT = 3456;
var pendingActions = [];
var appStatus = {};  // latest snapshot from browser
var FINNHUB_KEY = 'd898p41r01qla01mj11gd898p41r01qla01mj120';
var MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
};

var server = http.createServer(function (req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    var url = new URL(req.url, 'http://localhost:' + PORT);
    var pathname = url.pathname;

    // POST /api — enqueue action from me (CLI)
    if (req.method === 'POST' && pathname === '/api') {
        var body = '';
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
            try {
                var action = JSON.parse(body);
                pendingActions.push(action);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, queue: pendingActions.length }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    // GET /api/poll — browser polls for actions
    if (req.method === 'GET' && pathname === '/api/poll') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        var actions = pendingActions;
        pendingActions = [];
        res.end(JSON.stringify(actions));
        return;
    }

    // GET /api/status — read current app state
    if (req.method === 'GET' && pathname === '/api/status') {
        // Browser-side will push status here on each poll
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: appStatus || {} }));
        return;
    }

    // POST /api/status — browser pushes its state on each poll
    if (req.method === 'POST' && pathname === '/api/status') {
        var body = '';
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
            try { appStatus = JSON.parse(body); } catch (_) {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        });
        return;
    }

    // GET /api/data/:name — read a local json file from data/
    var dataMatch = pathname.match(/^\/api\/data\/(\w+)$/);
    if (req.method === 'GET' && dataMatch) {
        var fileName = dataMatch[1] + '.local.json';
        var filePath2 = path.join(__dirname, 'data', fileName);
        fs.readFile(filePath2, 'utf8', function (err, data) {
            if (err) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('{}');
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
            }
        });
        return;
    }

    // POST /api/data/:name — write a local json file to data/
    if (req.method === 'POST' && dataMatch) {
        var fileName = dataMatch[1] + '.local.json';
        var filePath2 = path.join(__dirname, 'data', fileName);
        var body = '';
        req.on('data', function (chunk) { body += chunk; });
        req.on('end', function () {
            fs.writeFile(filePath2, body, 'utf8', function (err) {
                res.writeHead(err ? 500 : 200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: !err }));
            });
        });
        return;
    }

    // GET /api/akshare — A-share market data via Python bridge
    if (req.method === 'GET' && pathname === '/api/akshare') {
        var symbol = url.searchParams.get('symbol');
        var period = url.searchParams.get('period') || '60';
        var limit = url.searchParams.get('limit') || '300';
        if (!symbol) { res.writeHead(400); res.end('Missing symbol'); return; }
        var cp = require('child_process');
        cp.execFile('python', [path.join(__dirname, 'akshare_bridge.py'), symbol, period, limit], { timeout: 30000 }, function (err, stdout) {
            if (err) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(stdout);
        });
        return;
    }

    // GET /api/health
    if (req.method === 'GET' && pathname === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // GET /api/finnhub — Finnhub proxy (appends API key server-side)
    if (req.method === 'GET' && pathname === '/api/finnhub') {
        var apiPath = url.searchParams.get('path');
        if (!apiPath) {
            res.writeHead(400);
            res.end('Missing path param');
            return;
        }
        var fhUrl = 'https://finnhub.io/api/v1/' + apiPath + '&token=' + FINNHUB_KEY;
        var fhParsed = new URL(fhUrl);
        var fhMod = fhParsed.protocol === 'https:' ? https : http;
        var fhOpts = {
            hostname: fhParsed.hostname, path: fhParsed.pathname + fhParsed.search,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        };
        var fhReq = fhMod.request(fhOpts, function (fhRes) {
            var body = '';
            fhRes.on('data', function (chunk) { body += chunk; });
            fhRes.on('end', function () {
                res.writeHead(fhRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(body);
            });
        });
        fhReq.on('error', function (e) {
            res.writeHead(502);
            res.end(JSON.stringify({ error: e.message }));
        });
        fhReq.end();
        return;
    }

    // GET /api/nasdaq — NASDAQ historical data proxy (CORS workaround)
    if (req.method === 'GET' && pathname === '/api/nasdaq') {
        var symbol = url.searchParams.get('symbol');
        var fromDate = url.searchParams.get('from') || '2026-01-01';
        var limit = url.searchParams.get('limit') || '100';
        if (!symbol) { res.writeHead(400); res.end('Missing symbol'); return; }
        var ndUrl = 'https://api.nasdaq.com/api/quote/' + encodeURIComponent(symbol) + '/historical?assetclass=stocks&fromdate=' + fromDate + '&limit=' + limit;
        var ndParsed = new URL(ndUrl);
        var ndReq = https.request({
            hostname: ndParsed.hostname, path: ndParsed.pathname + ndParsed.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.nasdaq.com/',
            },
        }, function (ndRes) {
            var body = '';
            ndRes.on('data', function (chunk) { body += chunk; });
            ndRes.on('end', function () {
                res.writeHead(ndRes.statusCode, { 'Content-Type': 'application/json' });
                res.end(body);
            });
        });
        ndReq.setTimeout(20000, function () { ndReq.destroy(); });
        ndReq.on('error', function (e) { res.writeHead(502); res.end(JSON.stringify({ error: e.message })); });
        ndReq.end();
        return;
    }

    // GET /api/proxy — CORS proxy for external APIs (yahoo, eastmoney, etc.)
    if (req.method === 'GET' && pathname === '/api/proxy') {
        var targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            res.writeHead(400);
            res.end('Missing url param');
            return;
        }
        // Only allow specific hosts for security
        var allowedHosts = ['query1.finance.yahoo.com', 'push2his.eastmoney.com', 'push2.eastmoney.com', 'stooq.com', 'api.nasdaq.com', 'web.ifzq.gtimg.cn', 'ifzq.gtimg.cn', 'web.sqt.gtimg.cn', 'qt.gtimg.cn'];
        try {
            var parsed = new URL(targetUrl);
            if (allowedHosts.indexOf(parsed.host) === -1) {
                res.writeHead(403);
                res.end('Host not allowed');
                return;
            }
        } catch (_) {
            res.writeHead(400);
            res.end('Invalid url');
            return;
        }
        var proxiedUrl = new URL(targetUrl);
        var proxyHostname = proxiedUrl.hostname;

        // For specific hosts with DNS/TLS issues, resolve IP manually
        var dnsFixHosts = { 'push2his.eastmoney.com': '140.207.67.156', 'push2.eastmoney.com': '61.129.129.196' };
        var isDnsFix = dnsFixHosts[proxyHostname];

        var proxyMod = proxiedUrl.protocol === 'https:' ? https : http;
        var proxyOpts = {
            hostname: isDnsFix || proxyHostname,
            path: proxiedUrl.pathname + proxiedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Referer': 'https://quote.eastmoney.com/',
                'Host': proxyHostname,
            },
        };
        // For HTTPS with manual IP, set servername for SNI
        if (isDnsFix && proxiedUrl.protocol === 'https:') {
            proxyOpts.servername = proxyHostname;
            proxyOpts.rejectUnauthorized = false;
        }
        var proxyReq = proxyMod.request(proxyOpts, function (proxyRes) {
            var body = '';
            proxyRes.on('data', function (chunk) { body += chunk; });
            proxyRes.on('end', function () {
                res.writeHead(proxyRes.statusCode, { 'Content-Type': proxyRes.headers['content-type'] || 'application/json' });
                res.end(body);
            });
        });
        proxyReq.on('error', function (e) {
            res.writeHead(502);
            res.end(e.message);
        });
        return;
    }

    // Serve static files
    var filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    var ext = path.extname(filePath);
    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.js' || ext === '.css' || ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
        res.end(data);
    });
});

// Ensure data directory exists
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

server.listen(PORT, function () {
    console.log('┌─────────────────────────────────────────┐');
    console.log('│  abminder Remote Control Server        │');
    console.log('│  Open: http://localhost:' + PORT + '          │');
    console.log('│  API:  POST /api  (send command)       │');
    console.log('└─────────────────────────────────────────┘');
});
