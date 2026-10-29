/* v2 UI：纯点击操作（无手牌区） */
(function () {
  "use strict";
  var E = window.V2Engine;
  var AI = window.V2AI;
  var C = E.COLOR_NAMES;
  var S = {
    game: null,
    humanSeat: 0,
    screen: "menu",
    busy: false,
    timer: null,
    lastResult: null,
    menu: { players: 2, colors: 2, seed: String(Math.floor(Math.random() * 1e9)) },
    logOpen: true,
  };

  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function colorClass(c) { return "c-" + ["red", "yellow", "blue", "green", "purple", "orange"][c]; }
  function colorName(c) { return C[c] || "?"; }
  function cardEl(card, opts) {
    opts = opts || {};
    var el = h("div", "vcard " + (opts.small ? "small " : "") + (card && card.color !== null && card.color !== undefined ? colorClass(card.color) : "c-hidden"));
    if (opts.label) el.appendChild(h("div", "vcard-label", opts.label));
    if (!card) {
      el.classList.add("empty");
      el.appendChild(h("div", "vcard-empty", opts.emptyText || "空"));
      return el;
    }
    var face = h("div", "vcard-face");
    if (card.hidden) {
      face.appendChild(h("div", "vcard-pattern", "?"));
      face.appendChild(h("div", "vcard-hidden-text", "暗牌"));
    } else {
      face.appendChild(h("div", "vcard-symbol", "◆"));
      face.appendChild(h("div", "vcard-color", colorName(card.color)));
      face.appendChild(h("div", "vcard-en", ["RED", "YELLOW", "BLUE", "GREEN", "PURPLE", "ORANGE"][card.color] || ""));
    }
    el.appendChild(face);
    return el;
  }

  function readCfg() {
    return { player_count: S.menu.players, color_count: S.menu.colors, seed: parseInt(S.menu.seed, 10) || 1, human_seat: 0, all_ai: false };
  }

  function startGame() {
    S.game = new E.Game(readCfg());
    S.humanSeat = 0;
    S.screen = "game";
    S.lastResult = null;
    S.busy = false;
    render();
    step();
  }

  function step() {
    if (S.timer) { clearTimeout(S.timer); S.timer = null; }
    if (!S.game || S.game.gameOver) { render(); return; }
    var g = S.game;
    var dly = S.fast ? 30 : 480;
    if (g.phase === E.PHASES.ARRANGE) {
      if (g.activePlayer().isAI) {
        S.busy = true;
        S.timer = setTimeout(function () {
          var opt = AI.arrange(g);
          if (opt) g.arrange(opt);
          S.busy = false;
          render();
          step();
        }, dly);
      } else { S.busy = false; render(); }
      return;
    }
    if (g.phase === E.PHASES.RESPONSE) {
      var r = g.currentResponder();
      if (r < 0) { S.busy = false; render(); return; }
      if (g.players[r].isAI) {
        S.busy = true;
        S.timer = setTimeout(function () {
          var opt = AI.chooseResponse(g);
          if (opt) g.performResponse(opt);
          S.busy = false;
          render();
          step();
        }, dly);
      } else { S.busy = false; render(); }
      return;
    }
    if (g.phase === E.PHASES.FINAL) {
      if (g.activePlayer().isAI) {
        S.busy = true;
        S.timer = setTimeout(function () {
          var opt = AI.chooseFinal(g);
          if (opt) g.performFinal(opt);
          var res = g.resolve();
          S.lastResult = res.reveal || null;
          S.busy = false;
          render();
          if (!g.gameOver) S.timer = setTimeout(function () { g.nextTurn(); render(); step(); }, S.fast ? 120 : 1400);
          else render();
        }, dly);
      } else { S.busy = false; render(); }
      return;
    }
    if (g.phase === E.PHASES.REVEAL) {
      S.busy = true;
      render();
      S.timer = setTimeout(function () {
        g.nextTurn();
        S.lastResult = null;
        S.busy = false;
        render();
        step();
      }, S.fast ? 200 : 1600);
      return;
    }
    render();
  }

  function humanAct(fn) {
    if (!S.game || S.busy) return;
    var res = fn();
    if (res && res.ok === false) { alert(res.error || "操作失败"); return; }
    render();
    step();
  }

  function onArrange(opt) {
    humanAct(function () { return S.game.arrange(opt); });
  }
  function onResponse(opt) {
    humanAct(function () { return S.game.performResponse(opt); });
  }
  function onFinal(opt) {
    humanAct(function () {
      var res = S.game.performFinal(opt);
      var rr = S.game.resolve();
      S.lastResult = rr.reveal || null;
      return res;
    });
    if (S.game.phase === E.PHASES.REVEAL || S.game.gameOver) step();
  }

  function render() {
    if (S.screen === "menu") { $("screen-menu").hidden = false; $("screen-game").hidden = true; renderMenu(); return; }
    $("screen-menu").hidden = true; $("screen-game").hidden = false;
    if (!S.game) return;
    var snap = S.game.snapshot(S.humanSeat);
    renderHeader(snap);
    renderPlayers(snap);
    renderStatus(snap);
    renderActions(snap);
    renderLog(snap);
    renderOver(snap);
  }

  function renderMenu() {
    var m = S.menu;
    ["players", "colors"].forEach(function (key) {
      var host = $(key + "-opts");
      clear(host);
      var values = key === "players" ? [2, 3, 4] : [2, 3, 4];
      values.forEach(function (v) {
        var b = h("button", "opt-btn" + (m[key] === v ? " active" : ""), v + (key === "players" ? " 人" : " 色"));
        b.onclick = function () { m[key] = v; renderMenu(); };
        host.appendChild(b);
      });
    });
    var seed = $("seed-input");
    if (seed && seed.value !== m.seed) seed.value = m.seed;
  }

  function renderHeader(snap) {
    $("hdr-round").textContent = "第 " + snap.round + " 轮";
    $("hdr-turn").textContent = snap.gameOver ? "对局结束" : "轮到 " + snap.activeName;
    var txt = "配牌阶段";
    if (snap.phase === E.PHASES.RESPONSE) txt = "响应阶段";
    else if (snap.phase === E.PHASES.FINAL) txt = "最后行动";
    else if (snap.phase === E.PHASES.REVEAL) txt = "结算";
    else if (snap.gameOver) txt = "结束";
    $("hdr-phase").textContent = txt;
  }

  function playerPanel(p, snap) {
    var wrap = h("div", "vplayer" + (p.seat === snap.turnSeat && !snap.gameOver ? " is-active" : "") + (p.seat === S.humanSeat ? " is-you" : ""));
    var head = h("div", "vp-head");
    head.appendChild(h("span", "vp-name", p.name));
    head.appendChild(h("span", "vp-score", "个人分 " + p.score + "/" + snap.winScore));
    wrap.appendChild(head);
    var cards = h("div", "vp-cards");
    cards.appendChild(cardEl(p.slot, { label: "配牌槽", small: true, emptyText: "空" }));
    var backupOpts = { label: "备牌位", small: true, emptyText: "空" };
    if (p.backup && p.backup.hidden) backupOpts.hide = true;
    cards.appendChild(cardEl(p.backup, backupOpts));
    if (p.drawn) cards.appendChild(cardEl(p.drawn, { label: "抽牌位", small: true, emptyText: "空" }));
    wrap.appendChild(cards);
    return wrap;
  }

  function renderPlayers(snap) {
    var host = $("players");
    clear(host);
    snap.players.forEach(function (p) { host.appendChild(playerPanel(p, snap)); });
  }

  function renderStatus(snap) {
    var el = $("status-text");
    if (snap.gameOver) { el.textContent = "对局结束，胜者：" + snap.winners.map(function (s) { return snap.players[s].name; }).join("、"); return; }
    if (snap.phase === E.PHASES.ARRANGE) {
      if (snap.turnSeat === S.humanSeat) el.textContent = "你的回合：抽到的牌放进配牌槽；再从旧的配牌槽/备牌位里选一张放备牌位，另一张弃掉。";
      else el.textContent = snap.activeName + " 正在配牌……";
    } else if (snap.phase === E.PHASES.RESPONSE) {
      var r = snap.responder;
      if (r === S.humanSeat) el.textContent = "轮到你响应 " + snap.activeName + "：可以交换/翻转对方的牌，或跳过。";
      else el.textContent = snap.players[r] ? snap.players[r].name + " 正在响应……" : "响应中……";
    } else if (snap.phase === E.PHASES.FINAL) {
      if (snap.turnSeat === S.humanSeat) el.textContent = "最后行动：可以翻自己的牌，或与任意玩家交换一张牌，然后结算。";
      else el.textContent = snap.activeName + " 正在最后行动……";
    } else if (snap.phase === E.PHASES.REVEAL) {
      var rev = snap.reveal;
      el.textContent = rev ? (rev.success ? "配对成功！" + snap.activeName + " 个人分 +1。" : "配对失败。") : "结算中……";
    }
  }

  function renderActions(snap) {
    var host = $("actions");
    clear(host);
    if (snap.gameOver) return;
    var g = S.game;
    if (S.busy) { host.appendChild(h("div", "waiting", "AI 思考中…")); return; }
    if (g.phase === E.PHASES.ARRANGE && g.turnSeat === S.humanSeat) {
      host.appendChild(h("h3", "act-title", "选择配牌组合"));
      var opts = g.arrangeOptions();
      opts.forEach(function (opt) {
        var b = h("button", "act-btn", opt.text);
        b.onclick = function () { onArrange(opt); };
        host.appendChild(b);
      });
      return;
    }
    if (g.phase === E.PHASES.RESPONSE && g.currentResponder() === S.humanSeat) {
      host.appendChild(h("h3", "act-title", "响应 " + snap.activeName));
      var ro = g.responseOptions();
      ro.forEach(function (opt) {
        var b = h("button", "act-btn" + (opt.kind === "pass" ? " pass" : ""), opt.text);
        b.onclick = function () { onResponse(opt); };
        host.appendChild(b);
      });
      return;
    }
    if (g.phase === E.PHASES.FINAL && g.turnSeat === S.humanSeat) {
      host.appendChild(h("h3", "act-title", "最后行动"));
      var fo = g.finalOptions();
      fo.forEach(function (opt) {
        var b = h("button", "act-btn" + (opt.kind === "pass" ? " pass" : ""), opt.text);
        b.onclick = function () { onFinal(opt); };
        host.appendChild(b);
      });
      return;
    }
    if (g.phase === E.PHASES.REVEAL) {
      var contour = h("button", "act-btn primary", "下一位");
      contour.onclick = function () {
        g.nextTurn();
        S.lastResult = null;
        render();
        step();
      };
      host.appendChild(contour);
      return;
    }
    host.appendChild(h("div", "waiting", "等待中……"));
  }

  function renderLog(snap) {
    var host = $("log");
    clear(host);
    snap.log.forEach(function (line) { host.appendChild(h("div", "log-line", line)); });
    host.scrollTop = host.scrollHeight;
  }

  function renderOver(snap) {
    var root = $("over-modal");
    if (!snap.gameOver) { root.hidden = true; return; }
    root.hidden = false;
    clear($("over-body"));
    $("over-body").appendChild(h("h2", "over-title", "对局结束"));
    $("over-body").appendChild(h("p", "over-sub", "胜者：" + snap.winners.map(function (s) { return snap.players[s].name; }).join("、")));
    snap.players.forEach(function (p) {
      $("over-body").appendChild(h("div", "over-row", p.name + "：个人分 " + p.score));
    });
    var again = h("button", "act-btn primary", "再来一局");
    again.onclick = function () { $("over-modal").hidden = true; startGame(); };
    var menu = h("button", "act-btn", "返回设置");
    menu.onclick = function () { $("over-modal").hidden = true; S.screen = "menu"; S.game = null; render(); };
    $("over-body").appendChild(again);
    $("over-body").appendChild(menu);
  }

  function init() {
    var q = null;
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    S.fast = !!(q && q.get("fast") === "1");
    if (q) {
      var pl = parseInt(q.get("players"), 10);
      var co = parseInt(q.get("colors"), 10);
      if (pl >= 2 && pl <= 4) S.menu.players = pl;
      if (co >= 2 && co <= 4) S.menu.colors = co;
      if (q.get("seed")) S.menu.seed = String(parseInt(q.get("seed"), 10) || S.menu.seed);
    }
    $("seed-input").value = S.menu.seed;
    $("start-btn").onclick = startGame;
    $("rules-btn").onclick = function () { $("rules-modal").hidden = false; };
    $("rules-close").onclick = function () { $("rules-modal").hidden = true; };
    $("new-game-btn").onclick = function () { if (S.game) { if (confirm("放弃当前对局，返回设置？")) { S.screen = "menu"; S.game = null; render(); } } else { S.screen = "menu"; render(); } };
    $("seed-input").onchange = function (e) { S.menu.seed = e.target.value; };
    window.V2App = {
      getGame: function () { return S.game; },
      getState: function () { return { screen: S.screen, phase: S.game ? S.game.phase : "", busy: !!S.busy, over: !!(S.game && S.game.gameOver) }; },
      startGame: startGame,
    };
    render();
    if (q && q.get("autostart") === "1") {
      setTimeout(function () { startGame(); }, 30);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();
