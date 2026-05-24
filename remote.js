/**
 * Remote control client - call from CLI to control the browser app.
 * Usage: node remote.js <action> [args...]
 *
 * Actions:
 *   toast <msg>              — 显示提示
 *   signal <type> [note] [cat] — 添加信号 (buy/hold/sell)
 *   signal-latest <type> [note] [cat] — 固定最新K线+信号
 *   symbol <name>            — 切换标的 (e.g. BTC-PERP)
 *   reload                   — 刷新图表
 *   import <file>            — 导入信号JSON文件
 *   exec <code>              — 执行任意JS代码
 */
var http = require('http');

var API = 'http://localhost:3456/api';
var args = process.argv.slice(2);
var action = args[0];

if (!action) {
    console.log('用法: node remote.js <action> [args...]');
    console.log('');
    console.log('  toast "hello"');
    console.log('  signal buy "突破阻力位" technical');
    console.log('  signal-latest sell "放量下跌" news');
    console.log('  symbol BTC-PERP');
    console.log('  reload');
    console.log('  import ./signals.json');
    console.log('  exec "remote.pinLatest(); remote.addSignal(\\"buy\\")"');
    console.log('');
    console.log('环境变量:');
    console.log('  REMOTE_SYMBOL=ZEC-PERP  - 指定信号所属标的（防混淆）');
    console.log('  例: REMOTE_SYMBOL=ZEC-PERP node remote.js signal-latest hold "分析" technical');
    process.exit(0);
}

function send(data) {
    return new Promise(function (resolve, reject) {
        var body = JSON.stringify(data);
        var req = http.request(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, function (res) {
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var result = JSON.parse(Buffer.concat(chunks).toString());
                if (result.ok) {
                    console.log('✓ 指令已发送 (队列: ' + result.queue + ')');
                } else {
                    console.log('✗ 错误:', result.error);
                }
                resolve(result);
            });
        });
        req.on('error', function (e) {
            console.log('✗ 连接失败:', e.message);
            console.log('  请确保 server.js 已在运行 (node server.js)');
            reject(e);
        });
        req.write(body);
        req.end();
    });
}

var cmds = {
    toast: function () { return send({ type: 'toast', msg: args[1] || '' }); },
    signal: function () {
        var data = { type: 'signal', signalType: args[1], note: args[2], category: args[3] };
        if (process.env.REMOTE_SYMBOL) data.symbol = process.env.REMOTE_SYMBOL;
        return send(data);
    },
    'signal-latest': function () {
        var data = { type: 'signal', target: 'latest', signalType: args[1], note: args[2], category: args[3] };
        if (process.env.REMOTE_SYMBOL) data.symbol = process.env.REMOTE_SYMBOL;
        return send(data);
    },
    symbol: function () { return send({ type: 'symbol', symbol: args[1] }); },
    reload: function () { return send({ type: 'reload' }); },
    import: function () {
        var fs = require('fs');
        var filePath = args[1];
        if (!filePath) { console.log('请指定文件路径'); return; }
        try {
            var data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return send({ type: 'exec', code: 'importRemoteData(' + JSON.stringify(data) + ')' });
        } catch (e) {
            console.log('✗ 文件读取失败:', e.message);
        }
    },
    exec: function () {
        return send({ type: 'exec', code: args.slice(1).join(' ') });
    },
};

if (cmds[action]) {
    cmds[action]().catch(function () {});
} else {
    console.log('未知指令: ' + action);
    console.log('可用指令: ' + Object.keys(cmds).join(', '));
}
