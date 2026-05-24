/**
 * Data fetcher — fetches Odaily news + OHLCV data, outputs JSON to stdout.
 * Usage: node fetch-data.js [symbols] [intervals]
 *
 * Examples:
 *   node fetch-data.js                                         # default: BTC-PERP (1d/1h/1m)
 *   node fetch-data.js ZEC-PERP,HYPE-PERP                      # multiple symbols
 *   node fetch-data.js BTC-PERP 1d,1h,5m                       # custom intervals
 *   node fetch-data.js ZEC-PERP,HYPE-PERP 1d,1h,1m             # both
 *   node fetch-data.js > data/scan_data.json 2>/dev/null       # save output
 */
var http = require('http');

var BASE = 'http://localhost:3456';

// Parse CLI args
var args = process.argv.slice(2);
var symbols = args[0] ? args[0].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['BTC-PERP'];
var intervals = args[1] ? args[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean) : ['1d', '1h', '1m'];

var INTERVAL_MS = { '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
var INTERVAL_LIMITS = { '1m': 20, '5m': 20, '15m': 20, '1h': 24, '4h': 24, '1d': 30 };

function get(path) {
    return new Promise(function (resolve, reject) {
        http.get(BASE + path, function (res) {
            var b = '';
            res.on('data', function (c) { b += c; });
            res.on('end', function () {
                try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function postJSON(path, data) {
    return new Promise(function (resolve, reject) {
        var body = JSON.stringify(data);
        var u = new URL(BASE + path);
        var req = http.request({
            hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, function (res) {
            var b = '';
            res.on('data', function (c) { b += c; });
            res.on('end', function () { try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
        });
        req.write(body);
        req.end();
    });
}

function fetchOHLCV(coin, interval) {
    var ms = INTERVAL_MS[interval] || 60000;
    var limit = INTERVAL_LIMITS[interval] || 20;
    var now = Date.now();
    return postJSON('/api/ohlcv', {
        type: 'candleSnapshot',
        req: { coin: coin, interval: interval, startTime: now - (limit + 5) * ms, endTime: now },
    }).then(function (d) {
        if (!Array.isArray(d)) throw new Error('bad response for ' + coin + ' ' + interval);
        return d.map(function (x) {
            return { t: x.t || x.time, o: x.o || x.open, h: x.h || x.high, l: x.l || x.low, c: x.c || x.close, v: x.v || x.volume };
        }).reverse().filter(function (x) { return x.t > 0 && parseFloat(x.o) > 0; }).map(function (x) {
            return { t: x.t, o: parseFloat(x.o), h: parseFloat(x.h), l: parseFloat(x.l), c: parseFloat(x.c), v: parseFloat(x.v) };
        });
    });
}

function fetchOdailyNewsflash() {
    return get('/api/odaily?path=' + encodeURIComponent('newsflash?page=1&size=20&lang=zh-cn')).then(function (d) {
        if (d.code === 200 && d.data && d.data.list) return d.data.list;
        return [];
    });
}

function fetchOdailyArticles() {
    return get('/api/odaily?path=' + encodeURIComponent('article?page=1&size=10&lang=zh-cn')).then(function (d) {
        if (d.code === 200 && d.data && d.data.list) return d.data.list;
        return [];
    });
}

function searchOdaily(keyword) {
    return get('/api/odaily?path=' + encodeURIComponent('search/newsflash?keyword=' + keyword + '&page=1&size=5&lang=zh-cn')).then(function (d) {
        if (d.code === 200 && d.data && d.data.list) return d.data.list;
        return [];
    });
}

// ============================================================

console.error('[fetch] symbols:', symbols.join(', '), 'intervals:', intervals.join(', '));

var promises = [];

// Odaily news
promises.push(fetchOdailyNewsflash().then(function (list) {
    console.error('[fetch]  newsflash: ' + list.length);
    return list;
}));
promises.push(fetchOdailyArticles().then(function (list) {
    console.error('[fetch]  articles: ' + list.length);
    return list;
}));

// Symbol-specific searches + OHLCV
symbols.forEach(function (sym) {
    var coin = sym.replace(/-PERP$/, '');
    // Search news for this symbol
    promises.push(searchOdaily(coin).then(function (list) {
        console.error('[fetch]  ' + coin + ' search: ' + list.length);
        return { symbol: sym, keyword: coin, results: list };
    }));
    // OHLCV for each interval
    intervals.forEach(function (iv) {
        promises.push(fetchOHLCV(coin, iv).then(function (list) {
            console.error('[fetch]  ' + coin + ' ' + iv + ': ' + list.length);
            return { symbol: sym, interval: iv, data: list };
        }));
    });
});

Promise.all(promises).then(function (results) {
    var out = {
        ts: Date.now(),
        odaily: {
            newsflash: results.shift(),
            articles: results.shift(),
        },
        searches: [],
        ohlcv: {},
    };

    results.forEach(function (r) {
        if (r.results) {
            out.searches.push({ symbol: r.symbol, keyword: r.keyword, results: r.results });
        } else if (r.symbol && r.interval && r.data) {
            if (!out.ohlcv[r.symbol]) out.ohlcv[r.symbol] = {};
            out.ohlcv[r.symbol][r.interval] = r.data;
        }
    });

    console.log(JSON.stringify(out));
    console.error('[fetch]  done');
}).catch(function (err) {
    console.error('[fetch] ERROR:', err.message);
    process.exit(1);
});
