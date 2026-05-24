/**
 * Email notification — sends email via server API.
 * Usage: node notify.js "subject" "body text"
 */
var http = require('http');

var subject = process.argv[2] || 'abminder 通知';
var text = process.argv[3] || '';

if (!text) {
    console.error('Usage: node notify.js "subject" "body text"');
    process.exit(1);
}

var body = JSON.stringify({ subject: subject, text: text });
var req = http.request({
    hostname: 'localhost', port: 3456, path: '/api/email/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, function (res) {
    var b = '';
    res.on('data', function (c) { b += c; });
    res.on('end', function () {
        var r = JSON.parse(b);
        if (r.ok) console.log('[notify] 邮件发送成功:', subject);
        else console.log('[notify] 邮件发送失败:', r.error);
    });
});
req.write(body);
req.end();
