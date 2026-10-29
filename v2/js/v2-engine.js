/* 《卡卡牌·正负牌》v2 规则引擎
 * 10 张手牌 / 正向牌区 / 负向牌区 / 5 轮 / 响应最多 2 次（交换、翻转）
 * 匹配：正向牌区当前朝上颜色 == 负向牌区当前朝下颜色
 * UMD: window.V2Engine / module.exports
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.V2Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COLOR_NAMES = ["红", "黄", "蓝", "绿", "紫", "橙"];
  var ROUNDS = 5;
  var HAND_SIZE = 10;
  var RESPONSES_PER_ROUND = 2;
  var PHASES = { PLACE_POS: "place_pos", PLACE_NEG: "place_neg", RESPONSE: "response", REVEAL: "reveal", OVER: "over" };

  function posmod(n, m) { return ((n % m) + m) % m; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Card(id, front, back) {
    this.id = id;
    this.sides = [front, back];
    this.up = 0; // 0 = 正面朝上；1 = 负面朝上（翻转后）
  }
  Card.prototype.color = function () { return this.sides[this.up]; };
  Card.prototype.otherColor = function () { return this.sides[1 - this.up]; };
  Card.prototype.down = function () { return this.sides[1 - this.up]; };
  Card.prototype.flip = function () { this.up = 1 - this.up; };

  function Player(seat, name, isAI) {
    this.seat = seat;
    this.name = name;
    this.isAI = !!isAI;
    this.score = 0;
    this.pos = null;
    this.neg = null;
    this.hand = [];
    this.responseUsed = 0;
    this.totalResponseUsed = 0;
  }

  function Game(cfg) {
    cfg = cfg || {};
    this.playerCount = clamp(parseInt(cfg.player_count || cfg.players || 2, 10) || 2, 2, 4);
    this.colorCount = clamp(parseInt(cfg.color_count || cfg.colors || 2, 10) || 2, 2, 4);
    this.seed = (cfg.seed === undefined ? Date.now() : cfg.seed) >>> 0;
    this.rng = makeRng(this.seed);
    this.players = [];
    this.humanSeat = cfg.all_ai ? -1 : (cfg.human_seat === undefined ? 0 : cfg.human_seat);
    this.round = 1;
    this.maxRounds = ROUNDS;
    this.startSeat = 0;
    this.phase = PHASES.PLACE_POS;
    this.placementIdx = 0;
    this.responseOrder = [];
    this.responseIdx = 0;
    this.actionsLeft = 0;
    this.revealResults = [];
    this.lastSuccessSeats = [];
    this.log = [];
    this.gameOver = false;
    this.winners = [];
    this._nextCardId = 1;
    this._setup();
  }

  Game.prototype._setup = function () {
    var i;
    for (i = 0; i < this.playerCount; i++) {
      this.players.push(new Player(i, "电脑" + String.fromCharCode(65 + i), true));
    }
    for (i = 0; i < this.players.length; i++) {
      if (i === this.humanSeat) this.players[i].name = "你";
      else this.players[i].name = "电脑" + String.fromCharCode(65 + (this.humanSeat >= 0 && i > this.humanSeat ? i - 1 : i));
      this.players[i].isAI = i !== this.humanSeat;
    }
    var total = this.playerCount * HAND_SIZE;
    var cards = [];
    for (i = 0; i < total; i++) {
      var front = i % this.colorCount;
      var back = Math.floor(this.rng() * this.colorCount);
      cards.push(new Card(this._nextCardId++, front, back));
    }
    this._shuffle(cards);
    for (i = 0; i < this.players.length; i++) {
      this.players[i].hand = cards.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE);
    }
    this._log("对局开始：" + this.playerCount + " 人 / " + this.colorCount + " 色，每人 " + HAND_SIZE + " 张手牌，共 " + ROUNDS + " 轮。");
    this._log("第 1 轮：从 " + this.players[this.startSeat].name + " 开始，依次放 1 张到正向牌区。");
  };

  Game.prototype._shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  };
  Game.prototype._log = function (msg) {
    this.log.push(msg);
    if (this.log.length > 300) this.log.shift();
  };
  Game.prototype.activePlayer = function () { return this.players[this.turnSeatForPlacement()]; };
  Game.prototype.turnSeatForPlacement = function () {
    return posmod(this.startSeat + this.placementIdx, this.playerCount);
  };
  Game.prototype.currentPlacer = function () {
    if (this.phase !== PHASES.PLACE_POS && this.phase !== PHASES.PLACE_NEG) return -1;
    if (this.placementIdx >= this.playerCount) return -1;
    return this.turnSeatForPlacement();
  };
  Game.prototype.currentResponder = function () {
    if (this.phase !== PHASES.RESPONSE) return -1;
    if (this.responseIdx >= this.responseOrder.length) return -1;
    return this.responseOrder[this.responseIdx];
  };

  Game.prototype._finishPlacement = function () {
    if (this.phase === PHASES.PLACE_POS) {
      this.phase = PHASES.PLACE_NEG;
      this.placementIdx = 0;
      this._log("正向牌区完成。第 " + this.round + " 轮：依次放 1 张到负向牌区（正面朝上）。");
      return true;
    }
    if (this.phase === PHASES.PLACE_NEG) {
      this._beginResponses();
      return true;
    }
    return false;
  };

  Game.prototype._beginResponses = function () {
    this.phase = PHASES.RESPONSE;
    this.responseOrder = [];
    this.usedByResponder = {};
    for (var i = 0; i < this.playerCount; i++) {
      this.responseOrder.push(posmod(this.startSeat + i, this.playerCount));
    }
    this.responseIdx = 0;
    this._resetActions();
    this._log("响应阶段开始：从 " + this.players[this.responseOrder[0]].name + " 开始，每人最多 " + RESPONSES_PER_ROUND + " 次。");
  };

  Game.prototype._resetActions = function () {
    this.actionsLeft = RESPONSES_PER_ROUND;
  };

  Game.prototype._nextResponder = function () {
    this.responseIdx += 1;
    if (this.responseIdx >= this.responseOrder.length) {
      this.responseIdx = this.responseOrder.length;
      this.matchAll();
      return true;
    }
    this._resetActions();
    this._log("响应轮到 " + this.players[this.responseOrder[this.responseIdx]].name + "。");
    return false;
  };

  Game.prototype.placeCard = function (handIndex) {
    if (this.phase !== PHASES.PLACE_POS && this.phase !== PHASES.PLACE_NEG) return { ok: false, error: "当前不是放牌阶段" };
    if (this.placementIdx >= this.playerCount) return { ok: false, error: "本轮放牌已结束" };
    var seat = this.currentPlacer();
    var p = this.players[seat];
    var idx = parseInt(handIndex, 10);
    if (!(idx >= 0 && idx < p.hand.length)) return { ok: false, error: "手牌序号非法" };
    var card = p.hand.splice(idx, 1)[0];
    card.up = 0;
    if (this.phase === PHASES.PLACE_POS) {
      if (p.pos) return { ok: false, error: "正向牌区已有牌" };
      p.pos = card;
      this._log(p.name + " 正向牌区放下「" + this._color(card.color()) + "」。");
    } else {
      if (p.neg) return { ok: false, error: "负向牌区已有牌" };
      p.neg = card;
      this._log(p.name + " 负向牌区放下「" + this._color(card.color()) + "」（正面朝上，匹配色为背面）。");
    }
    this.placementIdx += 1;
    if (this.placementIdx >= this.playerCount) this._finishPlacement();
    return { ok: true };
  };

  Game.prototype._color = function (c) { return COLOR_NAMES[clamp(c, 0, COLOR_NAMES.length - 1)]; };
  Game.prototype.colorName = function (c) { return this._color(c); };

  Game.prototype._ownCardDescs = function (seat) {
    var p = this.players[seat];
    var out = [];
    if (p.pos) out.push({ seat: seat, zone: "pos", index: 0 });
    if (p.neg) out.push({ seat: seat, zone: "neg", index: 0 });
    for (var i = 0; i < p.hand.length; i++) out.push({ seat: seat, zone: "hand", index: i });
    return out;
  };
  Game.prototype._oppNegDescs = function (seat) {
    var out = [];
    for (var i = 0; i < this.players.length; i++) {
      if (i === seat) continue;
      if (this.players[i].neg) out.push({ seat: i, zone: "neg", index: 0 });
    }
    return out;
  };
  Game.prototype._cardAt = function (d) {
    if (!d) return null;
    var p = this.players[d.seat];
    if (!p) return null;
    if (d.zone === "pos") return p.pos;
    if (d.zone === "neg") return p.neg;
    if (d.zone === "hand") return p.hand[d.index] || null;
    return null;
  };
  Game.prototype._cardDescText = function (d, viewerSeat) {
    var p = this.players[d.seat];
    var c = this._cardAt(d);
    if (!c) return "空";
    var owner = d.seat === viewerSeat ? "我的" : p.name + "的";
    var zone = d.zone === "pos" ? "正向牌" : d.zone === "neg" ? "负向牌" : "手牌";
    if (d.zone === "hand" && d.seat !== viewerSeat) return owner + zone + "（暗）";
    return owner + zone + "「" + this._color(c.color()) + "」";
  };
  Game.prototype._sameDesc = function (a, b) {
    return a && b && a.seat === b.seat && a.zone === b.zone && a.index === b.index;
  };

  Game.prototype._isUsed = function (seat, desc) {
    var card = this._cardAt(desc);
    if (!card) return true;
    var used = this.usedByResponder[seat];
    return !!(used && used[card.id]);
  };

  Game.prototype.responseOptions = function () {
    var out = [];
    if (this.phase !== PHASES.RESPONSE) return out;
    var r = this.currentResponder();
    if (r < 0) return out;
    if (this.actionsLeft <= 0) { out.push({ kind: "pass", text: "结束响应" }); return out; }
    var own = this._ownCardDescs(r);
    var oppNeg = this._oppNegDescs(r);
    for (var i = 0; i < own.length; i++) {
      var A = own[i];
      if (this._isUsed(r, A)) continue;
      for (var j = 0; j < own.length; j++) {
        if (i === j) continue;
        var B = own[j];
        if (this._isUsed(r, B)) continue;
        out.push({ kind: "replace", a: A, b: B, text: "用" + this._cardDescText(A, r) + " ↔ " + this._cardDescText(B, r) });
      }
      for (var k = 0; k < oppNeg.length; k++) {
        var BN = oppNeg[k];
        if (this._isUsed(r, BN)) continue;
        out.push({ kind: "replace", a: A, b: BN, text: "用" + this._cardDescText(A, r) + " ↔ " + this._cardDescText(BN, r) });
      }
    }
    for (var f = 0; f < own.length; f++) {
      if (this._isUsed(r, own[f])) continue;
      out.push({ kind: "flip", target: own[f], text: "翻转" + this._cardDescText(own[f], r) });
    }
    for (var g = 0; g < oppNeg.length; g++) {
      if (this._isUsed(r, oppNeg[g])) continue;
      out.push({ kind: "flip", target: oppNeg[g], text: "翻转" + this._cardDescText(oppNeg[g], r) });
    }
    out.push({ kind: "pass", text: "结束响应" });
    return out;
  };

  Game.prototype._matchOption = function (options, option) {
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (o.kind !== option.kind) continue;
      if (o.kind === "replace") {
        if (this._sameDesc(o.a, option.a) && this._sameDesc(o.b, option.b)) return o;
      } else if (o.kind === "flip") {
        if (this._sameDesc(o.target, option.target)) return o;
      } else if (o.kind === "pass") return o;
    }
    return null;
  };

  Game.prototype._detachCard = function (seat, card) {
    var p = this.players[seat];
    if (p.pos === card) { p.pos = null; return true; }
    if (p.neg === card) { p.neg = null; return true; }
    var idx = p.hand.indexOf(card);
    if (idx >= 0) { p.hand.splice(idx, 1); return true; }
    return false;
  };
  Game.prototype._putCard = function (d, card) {
    var p = this.players[d.seat];
    if (d.zone === "pos") p.pos = card;
    else if (d.zone === "neg") p.neg = card;
    else p.hand.push(card);
  };

  Game.prototype.performResponse = function (option) {
    if (this.phase !== PHASES.RESPONSE) return { ok: false, error: "当前不是响应阶段" };
    var r = this.currentResponder();
    if (r < 0) return { ok: false, error: "没有待响应玩家" };
    if (this.actionsLeft <= 0) return { ok: false, error: "本回合响应次数已用完" };
    var valid = this.responseOptions();
    var hit = this._matchOption(valid, option);
    if (!hit) return { ok: false, error: "非法响应选项" };
    if (hit.kind === "pass") return this.endResponse();
    var me = this.players[r];
    if (hit.kind === "flip") {
      var c = this._cardAt(hit.target);
      if (!c) return { ok: false, error: "目标牌不存在" };
      c.flip();
      this._log(me.name + " 翻转 " + this._cardDescText(hit.target, r) + "（现在朝上：" + this._color(c.color()) + "）。");
    } else if (hit.kind === "replace") {
      var ca = this._cardAt(hit.a);
      var cb = this._cardAt(hit.b);
      if (!ca || !cb || ca === cb) return { ok: false, error: "交换目标非法" };
      this._detachCard(hit.a.seat, ca);
      this._detachCard(hit.b.seat, cb);
      this._putCard(hit.a, cb);
      this._putCard(hit.b, ca);
      this._log(me.name + " 交换：" + this._cardDescText(hit.a, r) + " ↔ " + this._cardDescText(hit.b, r) + "。");
    }
    me.responseUsed += 1;
    me.totalResponseUsed = (me.totalResponseUsed || 0) + 1;
    if (!this.usedByResponder[r]) this.usedByResponder[r] = {};
    if (hit.kind === "flip") {
      var usedCard = this._cardAt(hit.target);
      if (usedCard) this.usedByResponder[r][usedCard.id] = true;
    } else if (hit.kind === "replace") {
      var ua = this._cardAt(hit.a);
      var ub = this._cardAt(hit.b);
      if (ua) this.usedByResponder[r][ua.id] = true;
      if (ub) this.usedByResponder[r][ub.id] = true;
    }
    this.actionsLeft -= 1;
    if (this.actionsLeft <= 0) this._nextResponder();
    else this._log(me.name + " 还可响应 " + this.actionsLeft + " 次。");
    return { ok: true, matched: this.phase === PHASES.REVEAL };
  };

  Game.prototype.endResponse = function () {
    if (this.phase !== PHASES.RESPONSE) return { ok: false, error: "当前不是响应阶段" };
    var r = this.currentResponder();
    if (r >= 0) this._log(this.players[r].name + " 结束响应。");
    var done = this._nextResponder();
    return { ok: true, matched: done };
  };

  Game.prototype.matchAll = function () {
    this.phase = PHASES.REVEAL;
    this.revealResults = [];
    this.lastSuccessSeats = [];
    for (var i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var posColor = p.pos ? p.pos.color() : -1;
      var negMatchColor = p.neg ? p.neg.down() : -1;
      var success = posColor >= 0 && negMatchColor >= 0 && posColor === negMatchColor;
      if (success) {
        p.score += 1;
        this.lastSuccessSeats.push(i);
      }
      this.revealResults.push({
        seat: i,
        posColor: posColor,
        negMatchColor: negMatchColor,
        negUpColor: p.neg ? p.neg.color() : -1,
        success: success,
        score: p.score,
      });
      this._log(p.name + " 匹配：" + (success ? "成功" : "失败") +
        "（正向朝上「" + this._color(posColor) + "」，负向朝下「" + this._color(negMatchColor) + "」）" +
        (success ? "，个人分 " + p.score : ""));
    }
    return { ok: true };
  };

  Game.prototype.nextRound = function () {
    if (this.phase !== PHASES.REVEAL) return { ok: false, error: "当前不是结算阶段" };
    for (var i = 0; i < this.players.length; i++) {
      this.players[i].pos = null;
      this.players[i].neg = null;
      this.players[i].responseUsed = 0;
    }
    this.revealResults = [];
    this.round += 1;
    if (this.round > this.maxRounds) {
      this.gameOver = true;
      this.phase = PHASES.OVER;
      this._decideWinners();
      return { ok: true, gameOver: true };
    }
    this.startSeat = posmod(this.startSeat + 1, this.playerCount);
    this.phase = PHASES.PLACE_POS;
    this.placementIdx = 0;
    this.responseOrder = [];
    this.responseIdx = 0;
    this.actionsLeft = 0;
    this._log("第 " + this.round + " 轮：从 " + this.players[this.startSeat].name + " 开始，依次放 1 张到正向牌区。");
    return { ok: true, gameOver: false };
  };

  Game.prototype._decideWinners = function () {
    var best = -1;
    var i;
    for (i = 0; i < this.players.length; i++) best = Math.max(best, this.players[i].score);
    var tied = [];
    for (i = 0; i < this.players.length; i++) if (this.players[i].score === best) tied.push(i);
    if (tied.length > 1) {
      var last = tied.filter(function (s) { return this.lastSuccessSeats.indexOf(s) >= 0; }, this);
      if (last.length > 0) tied = last;
    }
    if (tied.length > 1) {
      var minUsed = Math.min.apply(null, tied.map(function (s) { return this.players[s].totalResponseUsed || 0; }, this));
      tied = tied.filter(function (s) { return (this.players[s].totalResponseUsed || 0) === minUsed; }, this);
    }
    this.winners = tied;
    this._log("对局结束！" + tied.map(function (s) { return this.players[s].name + "（" + this.players[s].score + " 分）"; }, this).join("、"));
  };

  Game.prototype.snapshot = function (viewer) {
    viewer = viewer === undefined ? -1 : viewer;
    var showReveal = this.phase === PHASES.REVEAL || this.phase === PHASES.OVER;
    var players = this.players.map(function (p) {
      var pos = null;
      var neg = null;
      if (p.pos) pos = { id: p.pos.id, upColor: p.pos.color(), downHidden: true };
      if (p.neg) {
        var revealDown = p.seat === viewer || showReveal;
        neg = {
          id: p.neg.id,
          upColor: p.neg.color(),
          matchColor: revealDown ? p.neg.down() : null,
          downHidden: !revealDown,
        };
      }
      var hand = null;
      if (p.seat === viewer) {
        hand = p.hand.map(function (c) { return { id: c.id, upColor: c.color(), downColor: c.otherColor(), up: c.up }; });
      }
      return {
        seat: p.seat, name: p.name, isAI: p.isAI, score: p.score,
        pos: pos, neg: neg, hand: hand, handCount: p.hand.length,
      };
    });
    return {
      players: players,
      round: this.round,
      maxRounds: this.maxRounds,
      phase: this.phase,
      startSeat: this.startSeat,
      currentPlacer: this.currentPlacer(),
      responder: this.currentResponder(),
      actionsLeft: this.actionsLeft,
      gameOver: this.gameOver,
      winners: this.winners.slice(),
      revealResults: this.revealResults.slice(),
      log: this.log.slice(-100),
      humanSeat: this.humanSeat !== undefined ? this.humanSeat : viewer,
      colorCount: this.colorCount,
      seed: this.seed,
    };
  };

  return {
    Game: Game,
    Card: Card,
    COLOR_NAMES: COLOR_NAMES,
    PHASES: PHASES,
    ROUNDS: ROUNDS,
    HAND_SIZE: HAND_SIZE,
    RESPONSES_PER_ROUND: RESPONSES_PER_ROUND,
    makeRng: makeRng,
  };
});
