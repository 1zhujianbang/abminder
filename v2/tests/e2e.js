"use strict";
/* v2 浏览器 smoke test：自动点击到 game over，检查无 JS 异常、结算层与暗牌可见性。 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const PAGE = path.join(__dirname, "..", "index.html").replace(/\\/g, "/");
const OUT = path.join(__dirname, "artifacts");
const CHROME = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean).find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let checks = 0, fails = 0;
function ok(cond, msg) { checks += 1; if (cond) console.log("  ok   " + msg); else { fails += 1; console.log("  FAIL " + msg); } }

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.unref(); s.on("error", reject);
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}
async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* retry */ }
    await sleep(100);
  }
  throw new Error("HTTP timeout " + url);
}
class CDP {
  constructor(url) { this.url = url; this.id = 1; this.pending = new Map(); this.listeners = new Map(); this.ws = null; }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url); this.ws = ws;
      ws.onopen = resolve; ws.onerror = reject;
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result || {}); return; }
        if (m.method) (this.listeners.get(m.method) || []).forEach((fn) => fn(m.params));
      };
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("CDP timeout " + method)); } }, 15000);
    });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
}

(async () => {
  if (!CHROME) throw new Error("no chrome");
  if (!fs.existsSync(PAGE)) throw new Error("no page");
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kk-v2-e2e-"));
  const port = await freePort();
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-allow-origins=*", "--window-size=1440,900",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  try {
    await waitHttp("http://127.0.0.1:" + port + "/json/version", 15000);
    const list = await waitHttp("http://127.0.0.1:" + port + "/json/list", 8000);
    const target = list.find((t) => t.type === "page") || list[0];
    const cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.connect();
    const errors = [];
    cdp.on("Runtime.exceptionThrown", (p) => errors.push((p.exceptionDetails && (p.exceptionDetails.exception && p.exceptionDetails.exception.description || p.exceptionDetails.text)) || "exception"));
    cdp.on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") errors.push((p.args || []).map((a) => a.value || a.description || a.type).join(" ")); });
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const ev = async (expr) => {
      const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true, userGesture: true });
      if (r.exceptionDetails) throw new Error("eval: " + JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r.result ? r.result.value : undefined;
    };
    const wait = async (expr, ms, label) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (await ev(expr)) return; await sleep(80); }
      throw new Error("wait timeout: " + (label || expr));
    };

    const url = "file:///" + encodeURI(PAGE) + "?autostart=1&players=2&colors=2&seed=4242&fast=1";
    await cdp.send("Page.navigate", { url });
    await wait("!!window.V2App && V2App.getState().screen === 'game'", 8000, "game screen");
    ok(await ev("document.querySelectorAll('.vplayer').length") === 2, "2 人牌桌渲染");
    ok(await ev("document.querySelectorAll('.vcard').length >= 4"), "每人正向/负向牌区渲染");
    ok(await ev("document.querySelectorAll('.hand-card').length") === 10, "人类 10 张手牌渲染");
    ok(await ev("!!document.getElementById('actions')"), "操作栏存在");

    // 先推进到响应阶段，让双方负向牌区都有牌，再检查暗牌可见性
    const preDeadline = Date.now() + 12000;
    while (Date.now() < preDeadline) {
      const phase = await ev("V2App.getGame() ? V2App.getGame().phase : ''");
      if (phase === "response") break;
      await ev(`(function(){
        var hc=document.querySelector('.hand-card.can-play'); if(hc){hc.click(); return;}
        var b=document.querySelector('#actions .act-btn:not([disabled])'); if(b) b.click();
      })()`);
      await sleep(40);
    }
    // 人类自己的负向匹配色可见；电脑的负向匹配色显示“暗”
    const vis = await ev(`(function(){
      var ps=document.querySelectorAll('.vplayer');
      function negText(el){var c=el.querySelectorAll('.vcard')[1]; return c? c.textContent : '';}
      return { me: negText(ps[0]), ai: negText(ps[1]), phase: V2App.getGame().phase };
    })()`);
    ok(vis && vis.me.indexOf("匹配色") >= 0 && vis.me.indexOf("暗") < 0, "自己的负向匹配色可见（" + (vis && vis.me) + "）");
    ok(vis && vis.ai.indexOf("暗") >= 0, "对手负向匹配色暗置");

    let clicks = 0;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const st = await ev(`(function(){
        var over=document.getElementById('over-modal');
        if(over && !over.hidden) return 'over';
        var hc=document.querySelector('.hand-card.can-play');
        if(hc){ hc.click(); return 'click'; }
        var b=document.querySelector('#actions .act-btn:not([disabled])');
        if(b){ b.click(); return 'click'; }
        return 'wait';
      })()`);
      if (st === "over") break;
      if (st === "click") clicks += 1;
      await sleep(35);
    }
    ok(clicks > 0, "自动完成人类操作（" + clicks + " 次点击）");
    const over = await ev("!document.getElementById('over-modal').hidden");
    ok(over, "对局跑到结算层");
    ok((await ev("window.V2App.getGame().round")) >= 5, "跑满 5 轮");
    ok(await ev("!!document.querySelector('.over-sub')"), "结算层显示胜者");
    // 结算层个人分 rows
    ok((await ev("document.querySelectorAll('.over-row').length")) >= 2, "结算层显示所有玩家个人分");
    await sleep(200);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, "02-v2-game-over.png"), Buffer.from(shot.data, "base64"));
    console.log("  截图: " + path.join(OUT, "02-v2-game-over.png"));

    // 重新开一局，确认菜单/开始按钮也正常
    await ev("location.href = location.pathname + '?players=3&colors=3&seed=99&fast=1'");
    await sleep(300);
    await wait("document.querySelector('#start-btn') !== null", 4000, "menu");
    await ev("document.getElementById('start-btn').click()");
    await wait("window.V2App.getState().screen === 'game'", 4000, "manual start");
    ok((await ev("document.querySelectorAll('.vplayer').length")) === 3, "手动开始 3 人局");

    ok(errors.length === 0, "无 JS 异常/console error" + (errors.length ? "：" + errors.slice(0, 2).join(" | ") : ""));
    await cdp.send("Browser.close").catch(() => {});
    console.log("\nV2 E2E SUMMARY: checks " + checks + "/" + (checks) + ", failed " + fails);
    if (fails) process.exitCode = 1;
  } finally {
    try { chrome.kill(); } catch (e) { /* ignore */ }
  }
})().catch((e) => { console.error("V2 E2E FAIL:", e.stack || e); process.exit(1); });
