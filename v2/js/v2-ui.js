/* v2 UI：10 张手牌 / 正向牌区 / 负向牌区 / 5 轮 / 交换与翻转 */
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
    fast: false,
    timer: null,
    menu: { players: 2, colors: 2, seed: String(Math.floor(Math.random() * 1e9)) },
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
    var el = h("div", "vcard " + (opts.small ? "small " : "") + " " + (card && card.upColor !== undefined ? colorClass(card.upColor) : "c-hidden"));
    if (opts.label) el.appendChild(h("div", "vcard-label", opts.label));
    if (!card) {
      el.classList.add("empty");
      el.appendChild(h("div", "vcard-empty", opts.emptyText || "空"));
      return el;
    }
    var face = h("div", "vcard-face");
    face.appendChild(h("div", "vcard-symbol", "◆"));
    face.appendChild(h("div", "vcard-color", colorName(card.upColor)));
    var sub = [];
    if (opts.showBack && card.downColor !== undefined) sub.push("背 " + colorName(card.downColor));
    if (card.matchColor !== undefined && card.matchColor !== null) sub.push("匹配 " + colorName(card.matchColor));
    if (opts.extra) sub.push(opts.extra);
    if (sub.length) face.appendChild(h("div", "vcard-en", sub.join(" · ")));
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
    S.busy = false;
    render();
    step();
  }

  function step() {
    if (S.timer) { clearTimeout(S.timer); S.timer = null; }
    var g = S.game;
    if (!g || g.gameOver) { render(); return; }
    var dly = S.fast ? 25 : 420;
    if (g.phase === E.PHASES.PLACE_POS || g.phase === E.PHASES.PLACE_NEG) {
      var seat = g.currentPlacer();
      if (seat >= 0 && g.players[seat].isAI) {
        S.busy = true;
        S.timer = setTimeout(function () {
          var idx = AI.choosePlacement(g);
          g.placeCard(idx);
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
          g.performResponse(opt);
          S.busy = false;
          render();
          step();
        }, dly);
      } else { S.busy = false; render(); }
      return;
    }
    if (g.phase === E.PHASES.REVEAL) {
      S.busy = true;
      render();
      S.timer = setTimeout(function () {
        var res = g.nextRound();
        S.busy = false;
        render();
        if (res.gameOver) { render(); return; }
        step();
      }, S.fast ? 500 : 1800);
      return;
    }
    render();
  }

  function humanPlace(idx) {
    if (!S.game || S.busy) return;
    var r = S.game.placeCard(idx);
    if (!r.ok) { alert(r.error || "放牌失败"); return; }
    render();
    step();
  }
  function humanResponse(opt) {
    if (!S.game || S.busy) return;
    var r = S.game.performResponse(opt);
    if (!r.ok) { alert(r.error || "响应失败"); return; }
    render();
    step();
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
      [2, 3, 4].forEach(function (v) {
        var b = h("button", "opt-btn" + (m[key] === v ? " active" : ""), v + (key === "players" ? " 人" : " 色"));
        b.onclick = function () { m[key] = v; renderMenu(); };
        host.appendChild(b);
      });
    });
    var seed = $("seed-input");
    if (seed && seed.value !== m.seed) seed.value = m.seed;
  }

  function phaseText(snap) {
    if (snap.phase === E.PHASES.PLACE_POS) return "放正向牌";
    if (snap.phase === E.PHASES.PLACE_NEG) return "放负向牌";
    if (snap.phase === E.PHASES.RESPONSE) return "响应阶段";
    if (snap.phase === E.PHASES.REVEAL) return "匹配结算";
    if (snap.gameOver) return "对局结束";
    return "";
  }

  function renderHeader(snap) {
    $("hdr-round").textContent = "第 " + snap.round + " / " + snap.maxRounds + " 轮";
    var who = snap.currentPlacer >= 0 ? snap.players[snap.currentPlacer].name : snap.gameOver ? "—" : snap.players[snap.startSeat].name;
    $("hdr-turn").textContent = snap.gameOver ? "对局结束" : "轮到 " + who;
    $("hdr-phase").textContent = phaseText(snap);
  }

  function renderPlayers(snap) {
    var host = $("players");
    clear(host);
    snap.players.forEach(function (p) {
      var isCurrent = (snap.currentPlacer === p.seat) || (snap.phase === E.PHASES.RESPONSE && snap.responder === p.seat);
      var wrap = h("div", "vplayer" + (isCurrent && !snap.gameOver ? " is-active" : "") + (p.seat === S.humanSeat ? " is-you" : ""));
      var head = h("div", "vp-head");
      head.appendChild(h("span", "vp-name", p.name));
      head.appendChild(h("span", "vp-score", "个人分 " + p.score + " · 手牌 " + p.handCount));
      wrap.appendChild(head);
      var areas = h("div", "vp-cards");
      areas.appendChild(cardEl(p.pos, { label: "正向牌区", small: true, emptyText: "未放", extra: "取朝上色" }));
      areas.appendChild(cardEl(p.neg, {
        label: "负向牌区",
        small: true,
        emptyText: "未放",
        extra: p.neg ? (p.neg.downHidden ? "匹配色 暗" : "匹配色 " + colorName(p.neg.matchColor)) : "",
      }));
      // 人类手牌
      if (p.seat === S.humanSeat && p.hand) {
        var handWrap = h("div", "hand-wrap");
        handWrap.appendChild(h("div", "hand-title", "手牌（" + p.hand.length + " 张）"));
        var handRow = h("div", "hand-cards");
        p.hand.forEach(function (card, idx) {
          var b = h("button", "hand-card " + colorClass(card.upColor));
          var front = card.upColor;
          var back = card.downColor;
          b.innerHTML = '<span class="hc-face">' + colorName(front) + '<span class="hc-sub">背 ' + colorName(back) + '</span></span>';
          b.title = "手牌：上面「" + colorName(front) + "」，背面「" + colorName(back) + "」";
          if (S.game && (S.game.phase === E.PHASES.PLACE_POS || S.game.phase === E.PHASES.PLACE_NEG) && S.game.currentPlacer() === S.humanSeat && !S.busy) {
            b.classList.add("can-play");
            b.onclick = function () { humanPlace(idx); };
          } else {
            b.classList.add("dim");
          }
          handRow.appendChild(b);
        });
        handWrap.appendChild(handRow);
        wrap.appendChild(handWrap);
      }
      wrap.appendChild(areas);
      host.appendChild(wrap);
    });
  }

  function renderStatus(snap) {
    var el = $("status-text");
    if (snap.gameOver) {
      el.textContent = "对局结束，胜者：" + snap.winners.map(function (s) { return snap.players[s].name; }).join("、");
      return;
    }
    if (snap.phase === E.PHASES.PLACE_POS || snap.phase === E.PHASES.PLACE_NEG) {
      var who = snap.currentPlacer >= 0 ? snap.players[snap.currentPlacer].name : "";
      if (snap.currentPlacer === S.humanSeat) {
        el.textContent = "你的回合：从手牌点一张放进" + (snap.phase === E.PHASES.PLACE_POS ? "正向" : "负向") + "牌区。" +
          (snap.phase === E.PHASES.PLACE_POS ? "（正向区取朝上色）" : "（负向区取朝下色参与匹配）");
      } else {
        el.textContent = who + " 正在放" + (snap.phase === E.PHASES.PLACE_POS ? "正向" : "负向") + "牌……";
      }
      return;
    }
    if (snap.phase === E.PHASES.RESPONSE) {
      var r = snap.responder;
      if (r === S.humanSeat) {
        el.textContent = "轮到你响应：" + snap.actionsLeft + " 次动作；可以用自己的牌交换/翻转，或对别人的负向区操作。";
      } else {
        el.textContent = (snap.players[r] ? snap.players[r].name : "") + " 正在响应……";
      }
      return;
    }
    if (snap.phase === E.PHASES.REVEAL) {
      el.textContent = "本轮匹配结果已出：正向朝上色 = 负向朝下色 即成功。";
    }
  }

  function renderActions(snap) {
    var host = $("actions");
    clear(host);
    if (snap.gameOver) return;
    var g = S.game;
    if (S.busy) { host.appendChild(h("div", "waiting", "AI 思考中…")); return; }
    if ((g.phase === E.PHASES.PLACE_POS || g.phase === E.PHASES.PLACE_NEG) && g.currentPlacer() === S.humanSeat) {
      host.appendChild(h("div", "waiting", "请点击上方自己的手牌，放入" + (g.phase === E.PHASES.PLACE_POS ? "正向" : "负向") + "牌区。"));
      return;
    }
    if (g.phase === E.PHASES.RESPONSE && g.currentResponder() === S.humanSeat) {
      host.appendChild(h("h3", "act-title", "响应（剩余 " + g.actionsLeft + " 次）"));
      var opts = g.responseOptions();
      opts.forEach(function (opt) {
        var b = h("button", "act-btn" + (opt.kind === "pass" ? " pass" : ""), opt.text);
        b.onclick = function () { humanResponse(opt); };
        host.appendChild(b);
      });
      return;
    }
    if (g.phase === E.PHASES.REVEAL) {
      host.appendChild(h("div", "waiting", "结算中……下一轮自动开始"));
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
    if (q && q.get("autostart") === "1") setTimeout(function () { startGame(); }, 30);
  }
  document.addEventListener("DOMContentLoaded", init);
})();
