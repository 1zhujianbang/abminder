/* 《卡卡牌·双牌》v2 规则引擎（无手牌区；每人配牌槽+备牌位，交换/翻转两动作）
 * UMD: window.V2Engine / module.exports
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.V2Engine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var COLOR_NAMES = ["红", "黄", "蓝", "绿", "紫", "橙"];
  var COLOR_KEYS = ["red", "yellow", "blue", "green", "purple", "orange"];
  var WIN_SCORE = 10;
  var DRAW_BASE = 0; // 每人初始 2 张
  var PHASES = { ARRANGE: "arrange", RESPONSE: "response", FINAL: "final", REVEAL: "reveal", OVER: "over" };
  var SLOT = { SLOT: "slot", BACKUP: "backup" };

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
    this.up = 0;
  }
  Card.prototype.color = function () { return this.sides[this.up]; };
  Card.prototype.other = function () { return this.sides[1 - this.up]; };
  Card.prototype.flip = function () { this.up = 1 - this.up; };

  function Player(seat, name, isAI) {
    this.seat = seat;
    this.name = name;
    this.isAI = !!isAI;
    this.score = 0;
    this.slot = null;
    this.backup = null;
    this.drawn = null; // 本回合抽到的牌（桌面抽牌位，暗置）
  }

  function Game(cfg) {
    cfg = cfg || {};
    this.playerCount = clamp(parseInt(cfg.player_count || cfg.players || 2, 10) || 2, 2, 4);
    this.colorCount = clamp(parseInt(cfg.color_count || cfg.colors || 2, 10) || 2, 2, 4);
    this.seed = (cfg.seed === undefined ? Date.now() : cfg.seed) >>> 0;
    this.rng = makeRng(this.seed);
    this.players = [];
    this.deck = [];
    this.discard = [];
    this.turnSeat = 0;
    this.round = 1;
    this.phase = PHASES.ARRANGE;
    this.responseOrder = [];
    this.responseIdx = 0;
    this.log = [];
    this.gameOver = false;
    this.winners = [];
    this.reveal = null;
    this._nextCardId = 1;
    this._setup(cfg);
  }

  Game.prototype._setup = function (cfg) {
    var i, j;
    var human = cfg.all_ai ? -1 : (cfg.human_seat === undefined ? 0 : cfg.human_seat);
    for (i = 0; i < this.playerCount; i++) {
      var isAI = cfg.all_ai ? true : i !== human;
      this.players.push(new Player(i, "电脑A", isAI));
    }
    // 名字：人类固定“你”，AI 按座位顺序 A/B/C
    for (i = 0; i < this.players.length; i++) {
      if (i === human) this.players[i].name = "你";
      else this.players[i].name = "电脑" + String.fromCharCode(65 + i - (human >= 0 && i > human ? 1 : 0));
    }
    var count = this.colorCount * 8;
    for (i = 0; i < count; i++) {
      var a = Math.floor(this.rng() * this.colorCount);
      var b = Math.floor(this.rng() * this.colorCount);
      this.deck.push(new Card(this._nextCardId++, a, b));
    }
    this._shuffle(this.deck);
    for (i = 0; i < this.players.length; i++) {
      var p = this.players[i];
      var c1 = this._drawFromDeck();
      var c2 = this._drawFromDeck();
      p.slot = c1;
      p.backup = c2;
    }
    this.turnSeat = 0;
    this.round = 1;
    this.phase = PHASES.ARRANGE;
    this._log("对局开始：" + this.playerCount + " 人 / " + this.colorCount + " 色；个人分先到 " + WIN_SCORE + " 获胜。");
    this._startTurn(0);
  };

  Game.prototype._shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
  };

  Game.prototype._drawFromDeck = function () {
    if (this.deck.length === 0) {
      if (this.discard.length === 0) return null;
      this.deck = this.discard.slice();
      this.discard.length = 0;
      this._shuffle(this.deck);
    }
    return this.deck.pop() || null;
  };

  Game.prototype._log = function (msg) {
    this.log.push(msg);
    if (this.log.length > 200) this.log.shift();
  };

  Game.prototype.activePlayer = function () { return this.players[this.turnSeat]; };

  /** 回合开始：补牌到 2 张，再抽 1 张到抽牌位。 */
  Game.prototype._startTurn = function (seat) {
    var p = this.players[seat];
    this.turnSeat = seat;
    this.phase = PHASES.ARRANGE;
    this.responseOrder = [];
    this.responseIdx = 0;
    this.reveal = null;
    // 补牌：成功后两张会进弃牌堆；下回合补到 2 张
    if (!p.slot && !p.backup) {
      var a = this._drawFromDeck();
      var b = this._drawFromDeck();
      if (a) p.slot = a;
      if (b) p.backup = b;
    } else if (!p.slot) {
      p.slot = this._drawFromDeck();
    } else if (!p.backup) {
      p.backup = this._drawFromDeck();
    }
    p.drawn = this._drawFromDeck();
    this._log("—— 第 " + this.round + " 轮 · 轮到 " + p.name + " ——");
    if (p.drawn) this._log(p.name + " 抽了 1 张牌到抽牌位（暗置）");
  };

  /** 配牌可选项：抽到的牌放进配牌槽；再从旧配牌槽/备牌位里选 1 张放备牌位，另一张弃掉。 */
  Game.prototype.arrangeOptions = function () {
    var p = this.activePlayer();
    if (!p.drawn) return [];
    var out = [];
    var olds = [];
    if (p.slot) olds.push({ ref: SLOT.SLOT, card: p.slot });
    if (p.backup) olds.push({ ref: SLOT.BACKUP, card: p.backup });
    for (var i = 0; i < olds.length; i++) {
      out.push({
        kind: "arrange",
        slotRef: "drawn",
        backupRef: olds[i].ref,
        slotColor: p.drawn.color(),
        backupColor: olds[i].card.color(),
        text: "配牌槽放抽到的" + this._colorName(p.drawn) + "，备牌位放旧" + this._refName(olds[i].ref) + this._colorName(olds[i].card),
      });
    }
    return out;
  };

  Game.prototype._cardByRef = function (p, ref) {
    if (ref === SLOT.SLOT) return p.slot;
    if (ref === SLOT.BACKUP) return p.backup;
    if (ref === "drawn") return p.drawn;
    return null;
  };

  Game.prototype._takeCard = function (p, ref) {
    var c = this._cardByRef(p, ref);
    if (!c) return null;
    if (ref === SLOT.SLOT) p.slot = null;
    else if (ref === SLOT.BACKUP) p.backup = null;
    else if (ref === "drawn") p.drawn = null;
    return c;
  };

  Game.prototype.arrange = function (option) {
    if (this.phase !== PHASES.ARRANGE || this.gameOver) return { ok: false, error: "当前不是配牌阶段" };
    var p = this.activePlayer();
    var valid = this.arrangeOptions();
    var hit = null;
    for (var i = 0; i < valid.length; i++) {
      if (valid[i].backupRef === option.backupRef) { hit = valid[i]; break; }
    }
    if (!hit) return { ok: false, error: "非法配牌选项" };
    var drawnCard = p.drawn;
    var oldSlot = p.slot;
    var oldBackup = p.backup;
    var kept = hit.backupRef === SLOT.SLOT ? oldSlot : oldBackup;
    var discarded = hit.backupRef === SLOT.SLOT ? oldBackup : oldSlot;
    p.slot = drawnCard;
    p.backup = kept;
    p.drawn = null;
    if (discarded) this.discard.push(discarded);
    this._log(p.name + " 配牌：配牌槽放" + this._colorName(drawnCard) + "，备牌位暗置（保留旧" + this._refName(hit.backupRef) + "）。");
    this._beginResponses();
    return { ok: true, options: this.responseOptions() };
  };

  Game.prototype._beginResponses = function () {
    this.responseOrder = [];
    this.responseIdx = 0;
    for (var k = 1; k < this.players.length; k++) {
      this.responseOrder.push(posmod(this.turnSeat + k, this.players.length));
    }
    this.phase = PHASES.RESPONSE;
    if (this.responseOrder.length === 0) this.phase = PHASES.FINAL;
  };

  Game.prototype.currentResponder = function () {
    if (this.phase !== PHASES.RESPONSE) return -1;
    if (this.responseIdx >= this.responseOrder.length) return -1;
    return this.responseOrder[this.responseIdx];
  };

  /** 响应选项：交换（自己一张牌 ↔ 当前玩家一张牌）/ 翻转当前玩家一张牌 / 跳过 */
  Game.prototype.responseOptions = function () {
    var out = [];
    if (this.phase !== PHASES.RESPONSE) return out;
    var rs = this.currentResponder();
    if (rs < 0) return out;
    var me = this.players[rs];
    var active = this.activePlayer();
    var ownRefs = [];
    if (me.slot) ownRefs.push(SLOT.SLOT);
    if (me.backup) ownRefs.push(SLOT.BACKUP);
    var targetRefs = [];
    if (active.slot) targetRefs.push(SLOT.SLOT);
    if (active.backup) targetRefs.push(SLOT.BACKUP);
    for (var i = 0; i < ownRefs.length; i++) {
      for (var j = 0; j < targetRefs.length; j++) {
        out.push({
          kind: "exchange",
          ownRef: ownRefs[i],
          targetRef: targetRefs[j],
          text: "用我的" + this._refName(ownRefs[i]) + "换" + active.name + "的" + this._refName(targetRefs[j]),
        });
      }
    }
    for (var t = 0; t < targetRefs.length; t++) {
      out.push({ kind: "flip", targetRef: targetRefs[t], text: "翻转" + active.name + "的" + this._refName(targetRefs[t]) });
    }
    out.push({ kind: "pass", text: "跳过" });
    return out;
  };

  Game.prototype.performResponse = function (option) {
    if (this.phase !== PHASES.RESPONSE || this.gameOver) return { ok: false, error: "当前不是响应阶段" };
    var rs = this.currentResponder();
    if (rs < 0) return { ok: false, error: "没有待响应玩家" };
    var valid = this.responseOptions();
    var hit = null;
    for (var i = 0; i < valid.length; i++) {
      if (valid[i].kind === option.kind && valid[i].ownRef === option.ownRef && valid[i].targetRef === option.targetRef) { hit = valid[i]; break; }
    }
    if (!hit) return { ok: false, error: "非法响应选项" };
    var me = this.players[rs];
    var active = this.activePlayer();
    if (hit.kind === "exchange") {
      var own = this._takeCard(me, hit.ownRef);
      var tgt = this._takeCard(active, hit.targetRef);
      this._putCard(me, hit.ownRef, tgt);
      this._putCard(active, hit.targetRef, own);
      this._log(me.name + " 响应交换：" + me.name + "的" + this._refName(hit.ownRef) + " ↔ " + active.name + "的" + this._refName(hit.targetRef));
    } else if (hit.kind === "flip") {
      var c = this._cardByRef(active, hit.targetRef);
      if (c) c.flip();
      this._log(me.name + " 响应翻转：" + active.name + "的" + this._refName(hit.targetRef));
    } else {
      this._log(me.name + " 不响应");
    }
    this.responseIdx += 1;
    if (this.responseIdx >= this.responseOrder.length) this.phase = PHASES.FINAL;
    return { ok: true };
  };

  Game.prototype._putCard = function (p, ref, card) {
    if (ref === SLOT.SLOT) p.slot = card;
    else if (ref === SLOT.BACKUP) p.backup = card;
    else if (ref === "drawn") p.drawn = card;
  };

  /** 当前玩家最后行动：翻转自己的牌 / 与任意玩家交换（自己一张 ↔ 对方一张）/ 跳过 */
  Game.prototype.finalOptions = function () {
    var out = [];
    if (this.phase !== PHASES.FINAL) return out;
    var active = this.activePlayer();
    var ownRefs = [];
    if (active.slot) ownRefs.push(SLOT.SLOT);
    if (active.backup) ownRefs.push(SLOT.BACKUP);
    for (var i = 0; i < ownRefs.length; i++) {
      out.push({ kind: "flip", ownRef: ownRefs[i], text: "翻转自己的" + this._refName(ownRefs[i]) });
    }
    for (var s = 0; s < this.players.length; s++) {
      if (s === this.turnSeat) continue;
      var other = this.players[s];
      var targetRefs = [];
      if (other.slot) targetRefs.push(SLOT.SLOT);
      if (other.backup) targetRefs.push(SLOT.BACKUP);
      for (var oi = 0; oi < ownRefs.length; oi++) {
        for (var ti = 0; ti < targetRefs.length; ti++) {
          out.push({
            kind: "exchange",
            ownRef: ownRefs[oi],
            targetSeat: s,
            targetRef: targetRefs[ti],
            text: "用我的" + this._refName(ownRefs[oi]) + "换" + other.name + "的" + this._refName(targetRefs[ti]),
          });
        }
      }
    }
    out.push({ kind: "pass", text: "不行动" });
    return out;
  };

  Game.prototype.performFinal = function (option) {
    if (this.phase !== PHASES.FINAL || this.gameOver) return { ok: false, error: "当前不是最后行动阶段" };
    var valid = this.finalOptions();
    var hit = null;
    for (var i = 0; i < valid.length; i++) {
      if (valid[i].kind === option.kind && valid[i].ownRef === option.ownRef && valid[i].targetRef === option.targetRef && valid[i].targetSeat === option.targetSeat) { hit = valid[i]; break; }
    }
    if (!hit) return { ok: false, error: "非法最后行动" };
    var active = this.activePlayer();
    if (hit.kind === "flip") {
      var c = this._cardByRef(active, hit.ownRef);
      if (c) c.flip();
      this._log(active.name + " 最后行动：翻转自己的" + this._refName(hit.ownRef));
    } else if (hit.kind === "exchange") {
      var other = this.players[hit.targetSeat];
      var mine = this._takeCard(active, hit.ownRef);
      var theirs = this._takeCard(other, hit.targetRef);
      this._putCard(active, hit.ownRef, theirs);
      this._putCard(other, hit.targetRef, mine);
      this._log(active.name + " 最后交换：" + active.name + "的" + this._refName(hit.ownRef) + " ↔ " + other.name + "的" + this._refName(hit.targetRef));
    } else {
      this._log(active.name + " 最后不行动");
    }
    return { ok: true };
  };

  /** 结算：当前玩家配牌槽与备牌位同色则 +1；成功弃掉两张，失败保留。 */
  Game.prototype.resolve = function () {
    if (this.phase !== PHASES.FINAL || this.gameOver) return { ok: false, error: "当前不能结算" };
    var active = this.activePlayer();
    if (!active.slot || !active.backup) return { ok: false, error: "个人牌不足，无法结算" };
    var sc = active.slot.color();
    var bc = active.backup.color();
    var success = sc === bc;
    this.reveal = { seat: active.seat, success: success, slotColor: sc, backupColor: bc };
    if (success) {
      active.score += 1;
      this._log(active.name + " 配对成功！配牌槽与备牌位同为「" + this._colorName2(sc) + "」，个人分 +1（" + active.score + "/" + WIN_SCORE + "）。");
      this.discard.push(active.slot);
      this.discard.push(active.backup);
      active.slot = null;
      active.backup = null;
    } else {
      this._log(active.name + " 配对失败：配牌槽「" + this._colorName2(sc) + "」 vs 备牌位「" + this._colorName2(bc) + "」，不得分。");
    }
    this.phase = PHASES.REVEAL;
    if (success && active.score >= WIN_SCORE) {
      this.gameOver = true;
      this.winners = [active.seat];
      this.phase = PHASES.OVER;
      this._log("对局结束！胜者：" + active.name + "（个人分 " + active.score + "）");
    }
    return { ok: true, success: success, reveal: this.reveal, gameOver: this.gameOver };
  };

  Game.prototype.nextTurn = function () {
    if (this.gameOver || this.phase !== PHASES.REVEAL) return { ok: false };
    var next = posmod(this.turnSeat + 1, this.players.length);
    if (next === 0) this.round += 1;
    this._startTurn(next);
    return { ok: true };
  };

  Game.prototype._colorName = function (card) {
    if (!card) return "空";
    return "「" + COLOR_NAMES[clamp(card.color(), 0, COLOR_NAMES.length - 1)] + "」";
  };
  Game.prototype._colorName2 = function (c) { return COLOR_NAMES[clamp(c, 0, COLOR_NAMES.length - 1)]; };
  Game.prototype._refName = function (ref) {
    return ref === SLOT.SLOT ? "配牌槽" : ref === SLOT.BACKUP ? "备牌位" : "抽牌位";
  };

  /** 给 UI 的快照：隐藏别人备牌位/抽牌位的颜色；reveal 时公开当前玩家的备牌位。 */
  Game.prototype.snapshot = function (viewer) {
    viewer = viewer === undefined ? -1 : viewer;
    var self = this;
    var players = this.players.map(function (p) {
      var showBackup = p.seat === viewer || (self.reveal && self.reveal.seat === p.seat);
      var showDraw = p.seat === viewer;
      return {
        seat: p.seat,
        name: p.name,
        isAI: p.isAI,
        score: p.score,
        slot: p.slot ? { id: p.slot.id, color: p.slot.color() } : null,
        backup: p.backup ? { id: p.backup.id, color: showBackup ? p.backup.color() : null, hidden: !showBackup } : null,
        drawn: p.drawn ? { id: p.drawn.id, color: showDraw ? p.drawn.color() : null, hidden: !showDraw } : null,
      };
    });
    return {
      players: players,
      turnSeat: this.turnSeat,
      activeName: this.players[this.turnSeat].name,
      round: this.round,
      phase: this.phase,
      gameOver: this.gameOver,
      winners: this.winners.slice(),
      reveal: this.reveal,
      responder: this.currentResponder(),
      log: this.log.slice(-80),
      winScore: WIN_SCORE,
      colorCount: this.colorCount,
      seed: this.seed,
    };
  };

  Game.prototype.cardColorName = function (c) { return this._colorName2(c); };

  return {
    Game: Game,
    Card: Card,
    COLOR_NAMES: COLOR_NAMES,
    COLOR_KEYS: COLOR_KEYS,
    PHASES: PHASES,
    SLOT: SLOT,
    WIN_SCORE: WIN_SCORE,
    makeRng: makeRng,
  };
});
