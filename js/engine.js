/* 《卡卡牌 CCaarrddss》HTML Demo — 规则引擎（engine.js）
 * 规则依据：docs/RULES.md（新版规则：免费动作 + 身份区 + 全员响应窗口）。
 *
 * 新版规则要点：
 *   · 每回合一次行动：执行一次免费动作（移动/替换/翻转，不消耗手牌），或打出一张手牌（配对/固定/移除）。
 *   · 手牌只有 配对/固定/移除；没有暗置、没有响应槽。
 *   · 身份区放 1 张颜色牌，可为空（identity === null）；当前朝上颜色 = 得分颜色；
 *     任意玩家可移动/替换/翻转/固定/移除任意身份牌。
 *   · 固定牌：不能被移动/替换/翻转（响应中也不行），也不能作为移动/替换的来源；只能被【移除】。
 *   · 配对：配牌区两个槽都有牌时打出；随后进入响应窗口——从配对者的上家开始，沿座位号递增
 *     依次询问所有玩家（每人一次），每人可执行一次免费动作（目标限配牌区/身份牌）或跳过；
 *     全部询问完后调用 resolve_match() 结算。
 *   · 结算：两槽同色 → 所有身份区非空且身份朝上颜色=该颜色的玩家个人分 +1（上限 5）；
 *     否则无人得分。清空配牌区；个人分先到 5 获胜，同一次结算多人到 5 则共同获胜。
 *   · 没有阵营分，也没有暗置/响应槽。
 *
 * classic script + IIFE，挂到 window（浏览器）或 globalThis（Node vm）。
 * 本文件不含任何 DOM/BOM API；所有随机性走 this.rng（KKRNG），不使用 Math.random。
 * 引擎方法不抛异常：非法操作返回 {ok:false, error:"..."} 结果字典。
 */
(function (global) {
  "use strict";

  var D = global.KKDefs;
  var CardClass = global.KKCard;
  var PlayerClass = global.KKPlayer;
  var RNGClass = global.KKRNG;

  // =============================================================
  // 枚举别名（避免方法体内出现过长链式访问）
  // =============================================================
  var MOVE = D.Action.MOVE;
  var REPLACE = D.Action.REPLACE;
  var FLIP = D.Action.FLIP;
  var MATCH = D.Action.MATCH;
  var FIX = D.Action.FIX;
  var REMOVE = D.Action.REMOVE;

  var Z_DECK = D.Zone.DECK;
  var Z_DRAW = D.Zone.DRAW;
  var Z_IDENTITY = D.Zone.IDENTITY;
  var Z_MATCH = D.Zone.MATCH;
  var Z_DISCARD = D.Zone.DISCARD;

  var PH_SETUP = D.Phase.SETUP;
  var PH_ACTION = D.Phase.ACTION;
  var PH_RESPONSE = D.Phase.RESPONSE;
  var PH_GAME_OVER = D.Phase.GAME_OVER;

  // =============================================================
  // 通用小工具（模拟 GDScript 的 int()/clampi()/Dictionary.get() 语义）
  // =============================================================
  function toInt(value) {
    if (typeof value === "number") {
      var n = Math.trunc(value);
      return n === 0 ? 0 : n;
    }
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string") {
      var parsed = parseInt(value, 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  function clampi(value, lo, hi) {
    var v = toInt(value);
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function mini(a, b) {
    var x = toInt(a);
    var y = toInt(b);
    return x < y ? x : y;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /** GDScript Dictionary.get(key, default)：仅在 key 不存在时用默认值。 */
  function dget(obj, key, defaultValue) {
    if (obj !== null && obj !== undefined && hasOwn(obj, key)) return obj[key];
    return defaultValue;
  }

  function isPlainDict(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function posmod(a, n) {
    return ((a % n) + n) % n;
  }

  /** GDScript Array.erase(obj)：按引用移除第一个匹配项。 */
  function eraseRef(arr, value) {
    var idx = arr.indexOf(value);
    if (idx >= 0) arr.splice(idx, 1);
  }

  function isFreeAction(action) {
    return action === MOVE || action === REPLACE || action === FLIP;
  }

  // duplicate(true) 深拷贝：优先 structuredClone（数据中只有普通值/数组/字典）。
  var structuredCloneImpl =
    global.structuredClone && typeof global.structuredClone === "function" ? global.structuredClone : null;

  function dupPlain(value) {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      var arr = [];
      for (var i = 0; i < value.length; i++) arr.push(dupPlain(value[i]));
      return arr;
    }
    var out = {};
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) out[keys[k]] = dupPlain(value[keys[k]]);
    return out;
  }

  function duplicateDeep(value) {
    if (structuredCloneImpl) {
      try {
        return structuredCloneImpl(value);
      } catch (err) {
        return dupPlain(value);
      }
    }
    return dupPlain(value);
  }

  function isCardLike(value) {
    if (value instanceof CardClass) return true;
    // 兼容跨 realm 传入的卡牌对象（字段结构与 KKCard 一致）。
    return value !== null && typeof value === "object" && Array.isArray(value.sides) && typeof value.uid === "number";
  }

  // =============================================================
  // KKGame
  // =============================================================
  class KKGame {
    constructor() {
      // ===== 公开状态（只读使用）=====
      this.config = {};
      this.players = [];
      this.match_slots = [null, null]; // [null | KKCard, null | KKCard]
      this.round = 0;
      this.turn_seat = 0;
      this.first_seat = 0;
      this.phase = PH_SETUP;
      this.matcher = -1; // 正在结算的配对玩家，-1
      this.game_over = false;
      this.winners = [];
      this.win_reasons = [];
      this.log_lines = [];
      this.rng = new RNGClass(12345);

      this.color_deck = [];
      this.color_discard = [];
      this.action_deck = [];
      this.action_discard = [];
      this.last_turn_report = {};

      // ===== 内部状态 =====
      this._action_done = false; // 本回合行动是否已结算（advance_turn 前置）
      this._response_order = []; // 响应窗口询问顺序（座位；配对者最后）
      this._response_idx = 0; // 当前询问到第几位
      this._next_uid = 0;
    }

    // =============================================================
    // 生命周期
    // =============================================================

    /** 初始化并开局。返回 {ok, player_count, color_count, human_seat, first_seat, turn_seat, round, turn_report}。 */
    setup(cfg) {
      var cfg_obj = isPlainDict(cfg) ? cfg : {};
      var n = clampi(toInt(dget(cfg_obj, "player_count", 3)), 2, 4);
      var human_seat = clampi(toInt(dget(cfg_obj, "human_seat", 0)), 0, n - 1);
      var difficulty = clampi(toInt(dget(cfg_obj, "ai_difficulty", 1)), 0, 2);
      var seed_value = toInt(dget(cfg_obj, "seed", 12345));
      var all_ai = !!dget(cfg_obj, "all_ai", false);
      var fseat = clampi(toInt(dget(cfg_obj, "first_seat", 0)), 0, n - 1);
      var color_count_cfg = toInt(dget(cfg_obj, "color_count", 0));
      var color_count = color_count_cfg > 0 ? color_count_cfg : mini(n, 4);
      color_count = clampi(color_count, 2, 4);
      var names_in = dget(cfg_obj, "names", []);
      if (!Array.isArray(names_in)) names_in = [];
      this.config = {
        player_count: n,
        color_count: color_count,
        human_seat: human_seat,
        ai_difficulty: difficulty,
        seed: seed_value,
        first_seat: fseat,
        names: names_in.slice(),
        all_ai: all_ai,
      };

      this.rng = new RNGClass(seed_value);

      // ---- 重置全部状态 ----
      this.players = [];
      this.match_slots = [null, null];
      this.round = 1;
      this.first_seat = fseat;
      this.turn_seat = fseat;
      this.phase = PH_SETUP;
      this.matcher = -1;
      this.game_over = false;
      this.winners = [];
      this.win_reasons = [];
      this.log_lines = [];
      this.last_turn_report = {};
      this.color_deck = [];
      this.color_discard = [];
      this.action_deck = [];
      this.action_discard = [];
      this._response_order = [];
      this._response_idx = 0;
      this._action_done = false;
      this._next_uid = 0;

      // ---- 玩家 ----
      var ai_idx = 0;
      for (var seat = 0; seat < n; seat++) {
        var p = new PlayerClass();
        p.seat = seat;
        p.is_ai = all_ai || seat !== human_seat;
        if (seat < names_in.length && String(names_in[seat]) !== "") {
          p.name = String(names_in[seat]);
        } else if (p.is_ai) {
          p.name = D.ai_name(ai_idx);
          ai_idx += 1;
        } else {
          p.name = D.PLAYER_NAME_HUMAN;
        }
        p.personal = 0;
        p.hand = [];
        p.draw = [];
        p.identity = null;
        this.players.push(p);
      }

      // ---- 身份牌（RULES §4.3）----
      // 正面：颜色数不多于人数时，先保证每种活跃颜色各分给一名玩家，多余玩家从活跃颜色中随机（可重复）；
      //       颜色数多于人数时，每人分一种不同颜色，多出的颜色开局无人持有。
      // 背面：从活跃颜色中随机一种，可以和正面相同。
      var colors = this.active_colors();
      var seat_order = [];
      for (var so = 0; so < n; so++) seat_order.push(so);
      this._shuffle_ints(seat_order);
      for (var j = 0; j < n; j++) {
        var front = colors[this.rng.randi_range(0, colors.length - 1)];
        if (j < colors.length) {
          front = colors[j];
        }
        var back = colors[this.rng.randi_range(0, colors.length - 1)];
        var seat_no = seat_order[j];
        var idc = this._new_color_card(front, back);
        idc.owner = seat_no;
        idc.zone = Z_IDENTITY;
        idc.face_up = 0;
        this.players[seat_no].identity = idc;
      }

      // ---- 牌堆 ----
      this._build_color_deck();
      this._build_action_deck();

      this._log("对局开始：" + n + " 人局 · " + color_count + " 色 · 种子 " + seed_value);
      for (var pi = 0; pi < this.players.length; pi++) {
        var pp = this.players[pi];
        if (pp.identity !== null) {
          this._log(pp.name + " 的身份牌正面是「" + D.color_name(pp.identity.color_up()) + "」");
        }
      }

      // ---- 发初始手牌 3 张（轮流各抽，保证发牌顺序可复现）----
      for (var round_i = 0; round_i < D.HAND_START; round_i++) {
        for (var pj = 0; pj < this.players.length; pj++) {
          var a = this._draw_action_card();
          if (a >= 0) this.players[pj].hand.push(a);
        }
      }

      // ---- 开局即执行 first_seat 的回合开始 ----
      this.phase = PH_ACTION;
      this._begin_turn(fseat);

      return {
        ok: true,
        player_count: n,
        color_count: color_count,
        human_seat: human_seat,
        first_seat: this.first_seat,
        turn_seat: this.turn_seat,
        round: this.round,
        turn_report: duplicateDeep(this.last_turn_report),
      };
    }

    /**
     * 推进到下一座位并执行其回合开始。
     * 前置：phase == ACTION 且本回合行动已结算。
     */
    advance_turn() {
      if (this.game_over || this.phase === PH_GAME_OVER) {
        return { ok: false, error: "对局已结束", game_over: true, turn_seat: this.turn_seat, round: this.round, turn_report: {} };
      }
      if (this.phase !== PH_ACTION) {
        return { ok: false, error: "当前不是行动阶段", game_over: false, turn_seat: this.turn_seat, round: this.round, turn_report: {} };
      }
      if (!this._action_done) {
        return { ok: false, error: "本回合尚未完成行动", game_over: false, turn_seat: this.turn_seat, round: this.round, turn_report: {} };
      }
      var n = this.players.length;
      var next_seat = (this.turn_seat + 1) % n;
      if (next_seat === this.first_seat) {
        this.round += 1;
        this._log("—— 第 " + this.round + " 轮开始 ——");
      }
      this.turn_seat = next_seat;
      this._begin_turn(next_seat);
      return {
        ok: true,
        error: "",
        game_over: this.game_over,
        turn_seat: this.turn_seat,
        round: this.round,
        turn_report: duplicateDeep(this.last_turn_report),
      };
    }

    /** 防死锁兜底：轮到某玩家但其没有任何合法行动时，控制器调用：跳过本回合并弃 1 张手牌。 */
    auto_skip_turn(seat) {
      if (this.game_over || this.phase !== PH_ACTION) {
        return { ok: false, error: "当前不是行动阶段", log: "" };
      }
      if (this._action_done) {
        return { ok: false, error: "本回合已完成行动", log: "" };
      }
      if (toInt(seat) !== this.turn_seat) {
        return { ok: false, error: "还没轮到该玩家", log: "" };
      }
      // 防死锁兜底：没有任何合法行动时，跳过并弃 1 张手牌。
      // 否则手牌会一直满着、回合开始抽不到新牌，可能永久卡死。
      var p = this.players[this.turn_seat];
      var discarded = -1;
      if (p.hand.length > 0) {
        discarded = p.hand.pop();
        this._to_action_discard(discarded);
      }
      var msg = p.name + " 没有可以执行的行动，自动跳过本回合";
      if (discarded >= 0) {
        msg += "（弃 1 张手牌）";
      }
      this._log(msg);
      this._action_done = true;
      return { ok: true, error: "", log: msg, discarded: discarded };
    }

    // =============================================================
    // 回合开始（自动刷新）
    // =============================================================
    _begin_turn(seat) {
      var p = this.players[seat];
      this.turn_seat = seat;
      this.phase = PH_ACTION;
      this._action_done = false;
      this.matcher = -1;
      this._response_order.length = 0;
      this._response_idx = 0;

      var drew_hand = 0;
      var removed = 0;
      var drawn = 0;

      // a. 手牌：第 2 轮起，手牌未满 4 张则抽 1 张行动牌。
      if (this.round >= 2 && p.hand.length < D.HAND_CAP) {
        var a = this._draw_action_card();
        if (a >= 0) {
          p.hand.push(a);
          drew_hand = 1;
        }
      }

      // b. 抽牌区刷新：先把非固定牌全部放进颜色弃牌堆，再按剩余固定牌数量补抽。
      //    只刷新抽牌区；身份区/配牌区的固定牌不受影响。
      var snapshot_draw = p.draw.slice();
      for (var ci = 0; ci < snapshot_draw.length; ci++) {
        var card = snapshot_draw[ci];
        if (!card.fixed) {
          eraseRef(p.draw, card);
          this._to_color_discard(card);
          removed += 1;
        }
      }
      var fixed_count = p.draw.length;
      var need = 0;
      if (fixed_count <= 1) {
        need = 2;
      } else if (fixed_count === 2) {
        need = 1;
      }
      need = mini(need, D.DRAW_AREA_CAP - fixed_count); // 抽完总数不超过 3
      for (var di = 0; di < need; di++) {
        var c = this._draw_color_card();
        if (c === null) break;
        c.owner = seat;
        c.zone = Z_DRAW;
        c.fixed = false;
        p.draw.push(c);
        drawn += 1;
      }

      // c. 写对局记录
      this._log("第 " + this.round + " 轮 · 轮到 " + p.name);
      if (drew_hand > 0) {
        this._log(p.name + " 抽了 1 张行动牌（手牌 " + p.hand.length + " 张）");
      }
      if (removed > 0 || drawn > 0) {
        this._log(
          p.name + " 刷新抽牌区：移除非固定牌 " + removed + " 张，补抽 " + drawn + " 张（当前 " + p.draw.length + " 张）"
        );
      }

      this.last_turn_report = {
        seat: seat,
        round: this.round,
        hand_drawn: drew_hand,
        draw_removed: removed,
        draw_drawn: drawn,
        draw_size: p.draw.length,
        hand_size: p.hand.length,
        fixed_count: fixed_count,
      };
    }

    // =============================================================
    // 行动查询 1：手牌行动（配对 / 固定 / 移除）
    // =============================================================

    /** 本回合该玩家全部可打出的手牌选项；元素 {action, target, text, hand_index}。 */
    get_legal_actions(seat) {
      var out = [];
      if (this.game_over || this.phase !== PH_ACTION) return out;
      if (this._action_done) return out;
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length || s !== this.turn_seat) return out;
      var me = this.players[s];
      for (var hi = 0; hi < me.hand.length; hi++) {
        var action = me.hand[hi];
        if (action === MATCH) {
          this._legal_match(hi, out);
        } else if (action === FIX) {
          this._legal_fix(s, hi, out);
        } else if (action === REMOVE) {
          this._legal_remove(s, hi, out);
        }
        // 旧规则残留的 MOVE/REPLACE/FLIP 行动牌（若有）不再可打出，直接忽略。
      }
      return out;
    }

    _legal_match(hand_index, out) {
      // 前置条件：配牌区两个槽位都有牌。
      if (this.match_slots[0] === null || this.match_slots[1] === null) return;
      var c0 = this.match_slots[0];
      var c1 = this.match_slots[1];
      out.push({
        action: MATCH,
        target: {},
        text:
          "打出配对：配牌区 " +
          D.slot_mark(0) +
          this._card_label(c0) +
          "、" +
          D.slot_mark(1) +
          this._card_label(c1),
        hand_index: hand_index,
      });
    }

    _legal_fix(seat, hand_index, out) {
      var self = this;
      var actor = toInt(seat);
      this._for_each_color_card(function (zone, card_seat, slot, card) {
        if (card.fixed) return;
        out.push({
          action: FIX,
          target: { zone: zone, seat: card_seat, slot: slot, card_uid: card.uid },
          text: "固定" + self._zone_card_ref(zone, card_seat, slot, card, actor),
          hand_index: hand_index,
        });
      });
    }

    _legal_remove(seat, hand_index, out) {
      var self = this;
      var actor = toInt(seat);
      this._for_each_color_card(function (zone, card_seat, slot, card) {
        var text = "移除" + self._zone_card_ref(zone, card_seat, slot, card, actor);
        if (zone === Z_IDENTITY) text += "（身份区变为空）";
        out.push({
          action: REMOVE,
          target: { zone: zone, seat: card_seat, slot: slot, card_uid: card.uid },
          text: text,
          hand_index: hand_index,
        });
      });
    }

    // =============================================================
    // 行动查询 2：免费动作（移动 / 替换 / 翻转）
    // =============================================================

    /** 本回合该玩家的免费动作选项；元素 {action, target, text, free:true}。 */
    get_free_actions(seat) {
      var out = [];
      if (this.game_over || this.phase !== PH_ACTION) return out;
      if (this._action_done) return out;
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length || s !== this.turn_seat) return out;
      return this._build_free_actions(s);
    }

    _build_free_actions(seat) {
      var out = [];
      this._free_move(seat, out);
      this._free_replace(seat, out);
      this._free_flip(seat, out);
      return out;
    }

    _free_move(seat, out) {
      var actor = toInt(seat);
      var me = this.players[actor];
      var i;
      var slot;
      var pi;
      var p;
      var card;

      // ① 自己抽牌区的牌（固定牌的主人可以主动使用它作来源） → 配牌区空槽
      for (i = 0; i < me.draw.length; i++) {
        card = me.draw[i];
        for (slot = 0; slot < D.MATCH_SLOTS; slot++) {
          if (this.match_slots[slot] !== null) continue;
          out.push({
            action: MOVE,
            target: { zone: Z_DRAW, seat: actor, card_uid: card.uid, to_zone: Z_MATCH, to_seat: -1, slot: slot },
            text: "把" + this._draw_ref(actor, card, actor) + "移动到配牌区 " + D.slot_mark(slot),
            free: true,
          });
        }
      }

      // ② 自己抽牌区的牌（含固定牌，主人主动使用） → 自己的空身份区
      //    别人的身份区只能用“自己的身份牌”操作，不能用自己的颜色牌。
      for (i = 0; i < me.draw.length; i++) {
        card = me.draw[i];
        pi = actor;
        p = this.players[pi];
        if (p.identity === null) {
          out.push({
            action: MOVE,
            target: { zone: Z_DRAW, seat: actor, card_uid: card.uid, to_zone: Z_IDENTITY, to_seat: pi, slot: -1 },
            text: "把" + this._draw_ref(actor, card, actor) + "放进" + this._identity_zone_ref(pi, actor),
            free: true,
          });
        }
      }

      // ③ 自己的身份牌 → 配牌区空槽 / 其他玩家的空身份区（只有主人能移动自己的身份牌）
      for (pi = 0; pi < this.players.length; pi++) {
        if (pi !== actor) continue;
        p = this.players[pi];
        var idc = p.identity;
        if (idc === null) continue;
        for (slot = 0; slot < D.MATCH_SLOTS; slot++) {
          if (this.match_slots[slot] !== null) continue;
          out.push({
            action: MOVE,
            target: { zone: Z_IDENTITY, seat: pi, card_uid: idc.uid, to_zone: Z_MATCH, to_seat: -1, slot: slot },
            text:
              "把" +
              this._identity_ref(pi, idc, actor) +
              "移进配牌区 " +
              D.slot_mark(slot) +
              "（身份区变空，牌归" +
              this._self_label(actor) +
              "）",
            free: true,
          });
        }
        for (var qi = 0; qi < this.players.length; qi++) {
          if (qi === actor) continue;
          if (this.players[qi].identity !== null) continue;
          out.push({
            action: MOVE,
            target: { zone: Z_IDENTITY, seat: actor, card_uid: idc.uid, to_zone: Z_IDENTITY, to_seat: qi, slot: -1 },
            text:
              "把自己的身份牌" + this._card_label(idc) + "移进" +
              this._identity_zone_ref(qi, actor) +
              "（自己的身份区变空，牌归" + this.players[qi].name + "）",
            free: true,
          });
        }
      }
    }

    _free_replace(seat, out) {
      var actor = toInt(seat);
      var me = this.players[actor];
      var i;
      var slot;
      var pi;
      var p;
      var old;
      var card;

      for (i = 0; i < me.draw.length; i++) {
        card = me.draw[i];
        var source_text = this._draw_ref(actor, card, actor);

        // ① 自己抽牌区牌（固定牌主人可作为主动方使用它） → 有牌且非固定的配牌槽
        for (slot = 0; slot < D.MATCH_SLOTS; slot++) {
          old = this.match_slots[slot];
          if (old === null || old.fixed) continue;
          out.push({
            action: REPLACE,
            target: { zone: Z_DRAW, seat: actor, card_uid: card.uid, to_zone: Z_MATCH, to_seat: -1, slot: slot },
            text:
              "用" + source_text + "替换配牌区 " + D.slot_mark(slot) + " 的" + this._card_label(old),
            free: true,
          });
        }

        // ② 自己抽牌区牌 → 自己的有牌身份区（别人的身份区只能用自己的身份牌操作）
        for (pi = 0; pi < this.players.length; pi++) {
          if (pi !== actor) continue;
          p = this.players[pi];
          old = p.identity;
          if (old === null || old.fixed) continue;
          out.push({
            action: REPLACE,
            target: { zone: Z_DRAW, seat: actor, card_uid: card.uid, to_zone: Z_IDENTITY, to_seat: pi, slot: -1 },
            text: "用" + source_text + "替换" + this._identity_ref(pi, old, actor),
            free: true,
          });
        }
      }

      // ③ 自己的身份牌作为替换来源（固定牌主人也可作为主动方使用） → 有牌且非固定的配牌槽 / 其他玩家的有牌身份区
      var sidc = me.identity;
      if (sidc !== null) {
        var sid_text = this._identity_ref(actor, sidc, actor);
        for (slot = 0; slot < D.MATCH_SLOTS; slot++) {
          old = this.match_slots[slot];
          if (old === null || old.fixed) continue;
          out.push({
            action: REPLACE,
            target: { zone: Z_IDENTITY, seat: actor, card_uid: sidc.uid, to_zone: Z_MATCH, to_seat: -1, slot: slot },
            text:
              "用" + sid_text + "替换配牌区 " + D.slot_mark(slot) + " 的" + this._card_label(old) +
              "（身份区变空，牌归自己）",
            free: true,
          });
        }
        for (pi = 0; pi < this.players.length; pi++) {
          if (pi === actor) continue;
          p = this.players[pi];
          old = p.identity;
          if (old === null || old.fixed) continue;
          out.push({
            action: REPLACE,
            target: { zone: Z_IDENTITY, seat: actor, card_uid: sidc.uid, to_zone: Z_IDENTITY, to_seat: pi, slot: -1 },
            text:
              "用" + sid_text + "替换" + this._identity_ref(pi, old, actor) +
              "（你的身份区变空，牌归" + this.players[pi].name + "）",
            free: true,
          });
        }
      }
    }

    _free_flip(seat, out) {
      var self = this;
      var actor = toInt(seat);
      // 任意非固定颜色牌；固定牌只有主人可以作为主动方翻转自己的牌（任意玩家身份牌 / 抽牌区牌 / 配牌区牌）。
      this._for_each_color_card(function (zone, card_seat, slot, card) {
        if (card.fixed && card.owner !== actor) return;
        var text = "翻转" + self._zone_card_ref(zone, card_seat, slot, card, actor);
        // 只有操作者知道该牌背面时，才在文案里展示翻到哪一面（隐私规则）。
        if (card.owner === actor) {
          text += "→" + self._card_label_color(card.color_down());
        }
        text += card.fixed ? "（取消固定）" : "（翻面后固定）";
        out.push({
          action: FLIP,
          target: { zone: zone, seat: card_seat, slot: slot, card_uid: card.uid },
          text: text,
          free: true,
        });
      });
    }

    // =============================================================
    // 执行：手牌行动（配对 / 固定 / 移除）
    // =============================================================

    /** 打出一张手牌。option 必须是 get_legal_actions(seat) 中的一项（内部重新校验）。 */
    perform_action(seat, option) {
      var fail = function (error) {
        return { ok: false, error: error, action: -1, needs_response: false, log: "" };
      };
      if (this.game_over || this.phase === PH_GAME_OVER) return fail("对局已结束");
      if (this.phase !== PH_ACTION) return fail("当前不是行动阶段");
      if (this._action_done) return fail("本回合已完成行动");
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length || s !== this.turn_seat) return fail("还没轮到该玩家");
      if (!isPlainDict(option)) return fail("行动选项格式错误");
      var action = toInt(dget(option, "action", -1));
      var hi = toInt(dget(option, "hand_index", -1));
      var target_raw = dget(option, "target", {});
      if (!isPlainDict(target_raw)) return fail("行动选项 target 格式错误");
      var target = target_raw;
      if (action !== MATCH && action !== FIX && action !== REMOVE) return fail("未知的手牌行动类型");
      var p = this.players[s];
      if (hi < 0 || hi >= p.hand.length) return fail("hand_index 非法");
      if (p.hand[hi] !== action) return fail("手牌与行动类型不匹配");

      // 重新生成合法选项并逐项比对（不信任传入 option）
      var chosen = this._match_hand_option(this.get_legal_actions(s), action, hi, target);
      if (!chosen) return fail("非法行动选项（目标不合法）");

      var log_msg;
      if (action === MATCH) {
        // 配对：配牌区保持两张牌，进入响应窗口；打出的配对牌进入行动弃牌堆。
        p.hand.splice(hi, 1);
        this._to_action_discard(action);
        this.matcher = s;
        this.phase = PH_RESPONSE;
        this._action_done = false;
        this._build_response_queue(s);
        log_msg = p.name + " " + String(dget(chosen, "text", ""));
        this._log(log_msg);
        return { ok: true, error: "", action: action, needs_response: true, log: log_msg };
      }

      // 固定 / 移除：先执行效果（失败则手牌不动），成功后扣手牌进弃牌堆。
      if (!this._apply_play_effect(s, action, target)) return fail("行动执行失败");
      p.hand.splice(hi, 1);
      this._to_action_discard(action);
      this._action_done = true;
      log_msg = p.name + " 打出【" + D.action_name(action) + "】：" + String(dget(chosen, "text", ""));
      this._log(log_msg);
      return { ok: true, error: "", action: action, needs_response: false, log: log_msg };
    }

    // =============================================================
    // 执行：免费动作（移动 / 替换 / 翻转）
    // =============================================================

    /** 执行一次免费动作（不消耗手牌）。option 必须是 get_free_actions(seat) 中的一项。 */
    perform_free_action(seat, option) {
      var fail = function (error) {
        return { ok: false, error: error, action: -1, needs_response: false, log: "" };
      };
      if (this.game_over || this.phase === PH_GAME_OVER) return fail("对局已结束");
      if (this.phase !== PH_ACTION) return fail("当前不是行动阶段");
      if (this._action_done) return fail("本回合已完成行动");
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length || s !== this.turn_seat) return fail("还没轮到该玩家");
      if (!isPlainDict(option)) return fail("免费动作选项格式错误");
      var action = toInt(dget(option, "action", -1));
      if (!isFreeAction(action)) return fail("未知的免费动作类型");
      var target_raw = dget(option, "target", {});
      if (!isPlainDict(target_raw)) return fail("免费动作选项 target 格式错误");
      var target = target_raw;
      var chosen = this._match_free_option(this._build_free_actions(s), action, target);
      if (!chosen) return fail("非法免费动作选项（目标不合法）");
      if (!this._apply_free_effect(s, action, target)) return fail("免费动作执行失败");
      this._action_done = true;
      var p = this.players[s];
      var log_msg = p.name + " 执行免费动作【" + D.action_name(action) + "】：" + String(dget(chosen, "text", ""));
      this._log(log_msg);
      return { ok: true, error: "", action: action, needs_response: false, log: log_msg };
    }

    // =============================================================
    // 响应窗口（配对后：所有玩家按序各执行一次免费动作或跳过）
    // =============================================================

    /**
     * 建立响应队列：从配对者的上家开始，沿座位号递增绕一圈，所有玩家各询问一次。
     * 例：3 人局、1 号座位打出配对 → 询问顺序 0、1、2。
     */
    _build_response_queue(m) {
      this._response_order.length = 0;
      this._response_idx = 0;
      var n = this.players.length;
      var matcher = toInt(m);
      for (var k = 0; k < n; k++) {
        this._response_order.push(posmod(matcher - 1 + k, n));
      }
    }

    /** phase==RESPONSE 时返回当前待决定的玩家 seat；队列结束返回 -1。 */
    get_current_responder() {
      if (this.phase !== PH_RESPONSE) return -1;
      if (this._response_idx < 0 || this._response_idx >= this._response_order.length) return -1;
      return this._response_order[this._response_idx];
    }

    /** 当前响应者可选的免费动作（目标限配牌区/身份牌，不能翻抽牌区）；只能 pass_response 或选其中一项。 */
    get_response_options() {
      var out = [];
      if (this.phase !== PH_RESPONSE) return out;
      var r = this.get_current_responder();
      if (r < 0) return out;
      var all = this._build_free_actions(r);
      for (var i = 0; i < all.length; i++) {
        var opt = all[i];
        var action = toInt(dget(opt, "action", -1));
        var target = dget(opt, "target", {});
        // 响应中不能翻抽牌区；移动/替换本身的目标就是配牌区/身份区。
        if (action === FLIP && isPlainDict(target) && toInt(dget(target, "zone", -1)) === Z_DRAW) continue;
        out.push(opt);
      }
      // 响应中可以使用手牌【固定】【移除】，目标限配牌区/身份牌。
      var p = this.players[r];
      for (var hi = 0; hi < p.hand.length; hi++) {
        var hand_action = p.hand[hi];
        if (hand_action !== FIX && hand_action !== REMOVE) continue;
        var hand_opts = [];
        if (hand_action === FIX) this._legal_fix(r, hi, hand_opts);
        else this._legal_remove(r, hi, hand_opts);
        for (var k = 0; k < hand_opts.length; k++) {
          var ht = dget(hand_opts[k], "target", {});
          var hz = isPlainDict(ht) ? toInt(dget(ht, "zone", -1)) : -1;
          if (hz !== Z_MATCH && hz !== Z_IDENTITY) continue;
          out.push(hand_opts[k]);
        }
      }
      return out;
    }

    /** 当前响应者执行一次免费动作。返回 {ok, error, action, done, log}。 */
    respond(option) {
      var fail = function (error) {
        return { ok: false, error: error, action: -1, done: false, log: "" };
      };
      if (this.phase !== PH_RESPONSE) return fail("当前不是响应窗口");
      var r = this.get_current_responder();
      if (r < 0) return fail("没有待响应的玩家");
      if (!isPlainDict(option)) return fail("响应选项格式错误");
      var action = toInt(dget(option, "action", -1));
      var free_action = isFreeAction(action);
      var hand_action = action === FIX || action === REMOVE;
      if (!free_action && !hand_action) return fail("响应只能执行移动/替换/翻转，或打出固定/移除");
      var target_raw = dget(option, "target", {});
      if (!isPlainDict(target_raw)) return fail("响应选项 target 格式错误");
      var target = target_raw;
      var chosen = null;
      var p = this.players[r];
      if (hand_action) {
        var hi = toInt(dget(option, "hand_index", -1));
        if (hi < 0 || hi >= p.hand.length) return fail("hand_index 非法");
        if (p.hand[hi] !== action) return fail("手牌与响应行动类型不匹配");
        chosen = this._match_hand_option(this.get_response_options(), action, hi, target);
        if (!chosen) return fail("非法响应手牌选项（目标不合法）");
        if (!this._apply_play_effect(r, action, target)) return fail("响应手牌执行失败");
        p.hand.splice(hi, 1);
        this._to_action_discard(action);
      } else {
        chosen = this._match_free_option(this.get_response_options(), action, target);
        if (!chosen) return fail("非法响应选项（目标不合法）");
        if (!this._apply_free_effect(r, action, target)) return fail("响应执行失败");
      }
      this._response_idx += 1;
      var done = this.get_current_responder() < 0;
      var log_msg = p.name + " 响应【" + D.action_name(action) + "】：" + String(dget(chosen, "text", ""));
      this._log(log_msg);
      if (done) this._log("响应窗口结束，等待配对结算");
      return { ok: true, error: "", action: action, done: done, log: log_msg };
    }

    /** 当前响应者跳过（不响应），继续询问下一位。返回 {ok, error, done, log}。 */
    pass_response() {
      var fail = function (error) {
        return { ok: false, error: error, done: false, log: "" };
      };
      if (this.phase !== PH_RESPONSE) return fail("当前不是响应窗口");
      var r = this.get_current_responder();
      if (r < 0) return fail("没有待响应的玩家");
      this._response_idx += 1;
      var done = this.get_current_responder() < 0;
      var log_msg = this.players[r].name + " 不响应";
      this._log(log_msg);
      if (done) this._log("响应窗口结束，等待配对结算");
      return { ok: true, error: "", done: done, log: log_msg };
    }

    // =============================================================
    // 配对结算与胜利
    // =============================================================

    /** 前置：phase==RESPONSE 且 get_current_responder()==-1。 */
    resolve_match() {
      var result = {
        ok: false,
        error: "",
        success: false,
        invalid: false,
        color: -1,
        slot_colors: [-1, -1],
        matcher: this.matcher,
        personal_gained: [],
        game_over: false,
        winners: [],
        win_reasons: [],
        log: "",
      };
      if (this.phase !== PH_RESPONSE) {
        result.error = "当前不是响应窗口";
        return result;
      }
      if (this.get_current_responder() !== -1) {
        result.error = "响应窗口尚未结束";
        return result;
      }
      var m = this.matcher;
      var slot_colors = [-1, -1];
      for (var slot = 0; slot < D.MATCH_SLOTS; slot++) {
        var card = this.match_slots[slot];
        if (card !== null) slot_colors[slot] = card.color_up();
      }
      var success = false;
      var invalid = false;
      var color = -1;
      var personal_gained = [];
      var log_msg = "";
      if (this.match_slots[0] === null || this.match_slots[1] === null) {
        invalid = true;
        log_msg = "配对无效：配牌区不足两张牌，无人得分";
      } else if (slot_colors[0] === slot_colors[1]) {
        success = true;
        color = slot_colors[0];
        var names = [];
        for (var pi = 0; pi < this.players.length; pi++) {
          var p = this.players[pi];
          if (p.identity !== null && p.identity.color_up() === color && p.personal < D.WIN_SCORE) {
            p.personal = mini(p.personal + 1, D.WIN_SCORE);
            personal_gained.push(p.seat);
            names.push(p.name);
          }
        }
        log_msg = "配对成功！两张牌同为「" + D.color_name(color) + "」";
        if (personal_gained.length > 0) {
          log_msg += "；" + this._join_names(names) + " 个人分 +1";
        } else {
          log_msg += "；该颜色当前无人持有身份，无人得分";
        }
      } else {
        log_msg =
          "配对失败：两张牌颜色不同（" +
          D.color_name(slot_colors[0]) +
          " vs " +
          D.color_name(slot_colors[1]) +
          "），无人得分";
      }
      // 无论结果如何，配牌区清空，牌进颜色弃牌堆（固定状态消失）。
      for (var si = 0; si < D.MATCH_SLOTS; si++) {
        var scard = this.match_slots[si];
        if (scard !== null) this._to_color_discard(scard);
        this.match_slots[si] = null;
      }
      this.matcher = -1;
      this._response_order.length = 0;
      this._response_idx = 0;
      this._action_done = true;
      this.phase = PH_ACTION;
      this._log(log_msg);
      this._check_victory();
      if (this.game_over) this.phase = PH_GAME_OVER;

      result.success = success;
      result.invalid = invalid;
      result.color = color;
      result.slot_colors = slot_colors;
      result.matcher = m;
      result.personal_gained = personal_gained;
      result.game_over = this.game_over;
      result.winners = this.winners.slice();
      result.win_reasons = this.win_reasons.slice();
      result.log = log_msg;
      result.ok = true;
      return result;
    }

    _check_victory() {
      if (this.game_over) return;
      var win_set = [];
      var reasons = [];
      // 个人分达到 5：该玩家获胜；同一次结算多人达到 5 分则全部获胜。
      for (var pj = 0; pj < this.players.length; pj++) {
        var pp = this.players[pj];
        if (pp.personal >= D.WIN_SCORE) {
          if (win_set.indexOf(pp.seat) < 0) win_set.push(pp.seat);
          reasons.push(pp.name + " 个人积满 " + D.WIN_SCORE + " 分");
        }
      }
      if (win_set.length === 0) return;
      win_set.sort(function (a, b) {
        return a - b;
      });
      this.winners = win_set;
      this.win_reasons = reasons;
      this.game_over = true;
      this.phase = PH_GAME_OVER;
      var win_names = [];
      for (var wk = 0; wk < this.winners.length; wk++) win_names.push(this.players[this.winners[wk]].name);
      this._log("对局结束！胜者：" + this._join_names(win_names));
      for (var ri = 0; ri < this.win_reasons.length; ri++) {
        this._log("胜利条件：" + this.win_reasons[ri]);
      }
    }

    // =============================================================
    // 效果实现（perform / respond 内部已重新校验过目标，这里再做防御性校验）
    // =============================================================

    _apply_play_effect(seat, action, target) {
      if (action === FIX) return this._effect_fix(target);
      if (action === REMOVE) return this._effect_remove(target);
      return false;
    }

    _apply_free_effect(seat, action, target) {
      if (action === MOVE) return this._effect_move(seat, target);
      if (action === REPLACE) return this._effect_replace(seat, target);
      if (action === FLIP) return this._effect_flip(seat, target);
      return false;
    }

    /** 移动：自己抽牌区非固定牌 → 空配牌槽 / 空身份区；任意玩家非固定身份牌 → 空配牌槽。 */
    _effect_move(seat, target) {
      var actor = toInt(seat);
      var zone = toInt(dget(target, "zone", -1));
      var src_seat = toInt(dget(target, "seat", -1));
      var uid = toInt(dget(target, "card_uid", -1));
      var to_zone = toInt(dget(target, "to_zone", -1));
      var to_seat = toInt(dget(target, "to_seat", -1));
      var slot = toInt(dget(target, "slot", -1));

      var card = null;
      if (zone === Z_DRAW) {
        // 来源只能是自己抽牌区的牌；固定牌只有主人作主动方时可用
        if (src_seat !== actor) return false;
        card = this._find_draw_card(src_seat, uid);
        if (card === null) return false;
      } else if (zone === Z_IDENTITY) {
        // 只有主人能移动自己的身份牌；别人的身份牌不能用其自身来移动
        if (src_seat !== actor) return false;
        if (src_seat < 0 || src_seat >= this.players.length) return false;
        var idc = this.players[src_seat].identity;
        if (idc === null || idc.uid !== uid) return false;
        card = idc;
      } else {
        return false;
      }

      if (to_zone === Z_MATCH) {
        if (slot < 0 || slot >= D.MATCH_SLOTS || this.match_slots[slot] !== null) return false;
        if (zone === Z_DRAW) {
          eraseRef(this.players[src_seat].draw, card);
        } else {
          this.players[src_seat].identity = null; // 移走后原身份区为空
        }
        card.fixed = false; // 固定牌被主动使用后失去固定
        card.owner = actor; // 进入配牌区后归移动者所有
        card.zone = Z_MATCH;
        this.match_slots[slot] = card;
        return true;
      }

      if (to_zone === Z_IDENTITY) {
        if (to_seat < 0 || to_seat >= this.players.length) return false;
        if (this.players[to_seat].identity !== null) return false;
        if (zone === Z_DRAW) {
          // 自己抽牌区的颜色牌只能填补自己的空身份区；别人的身份区不能用自己的颜色牌。
          if (to_seat !== actor) return false;
          eraseRef(this.players[src_seat].draw, card);
        } else {
          // 自己的身份牌可以移进其他玩家的空身份区（主动给予身份）
          if (src_seat !== actor || to_seat === actor) return false;
          this.players[actor].identity = null;
        }
        card.fixed = false; // 固定牌被主动使用后失去固定
        card.owner = to_seat; // 进入身份区后归该身份区所属玩家所有
        card.zone = Z_IDENTITY;
        this.players[to_seat].identity = card;
        return true;
      }
      return false;
    }

    /** 替换：自己抽牌区非固定牌 → 有牌且非固定的配牌槽 / 身份区；旧牌进颜色弃牌堆。 */
    /** 替换：自己抽牌区的牌 / 自己的身份牌（固定牌主人可作主动来源）→ 有牌且非固定的配牌槽或身份区。 */
    _effect_replace(seat, target) {
      var actor = toInt(seat);
      var zone = toInt(dget(target, "zone", -1));
      var src_seat = toInt(dget(target, "seat", -1));
      var uid = toInt(dget(target, "card_uid", -1));
      var to_zone = toInt(dget(target, "to_zone", -1));
      var to_seat = toInt(dget(target, "to_seat", -1));
      var slot = toInt(dget(target, "slot", -1));

      var card = null;
      var from_identity = false;
      if (zone === Z_DRAW) {
        if (src_seat !== actor) return false;
        card = this._find_draw_card(src_seat, uid);
        if (card === null) return false; // 固定牌主人可作为主动方使用它作替换来源
      } else if (zone === Z_IDENTITY) {
        if (src_seat !== actor) return false;
        card = this.players[actor].identity;
        if (card === null || card.uid !== uid) return false;
        from_identity = true;
      } else {
        return false;
      }

      var remove_source = function () {
        if (from_identity) this.players[actor].identity = null;
        else eraseRef(this.players[actor].draw, card);
      }.bind(this);

      if (to_zone === Z_MATCH) {
        if (slot < 0 || slot >= D.MATCH_SLOTS) return false;
        var old = this.match_slots[slot];
        if (old === null || old.fixed) return false; // 固定牌不能被替换
        this._to_color_discard(old);
        remove_source();
        card.fixed = false; // 固定牌被主动使用后失去固定
        card.owner = actor;
        card.zone = Z_MATCH;
        this.match_slots[slot] = card;
        return true;
      }

      if (to_zone === Z_IDENTITY) {
        if (to_seat < 0 || to_seat >= this.players.length) return false;
        if (from_identity && to_seat === actor) return false; // 不能用自己的身份牌替换自己的身份牌
        if (!from_identity && to_seat !== actor) return false; // 别人的身份区只能用自己的身份牌替换，不能用自己的颜色牌
        var old_idc = this.players[to_seat].identity;
        if (old_idc === null || old_idc.fixed) return false;
        this._to_color_discard(old_idc);
        remove_source();
        card.fixed = false; // 固定牌被主动使用后失去固定
        card.owner = to_seat; // 新身份牌归该身份区所属玩家所有
        card.zone = Z_IDENTITY;
        this.players[to_seat].identity = card;
        return true;
      }
      return false;
    }

    /** 翻转：任意非固定颜色牌；固定牌只有主人可以作为主动方翻转自己的牌。 */
    _effect_flip(actor, target) {
      var card = this._target_card(target);
      if (card === null) return false;
      if (card.fixed && card.owner !== toInt(actor)) return false;
      var was_fixed = card.fixed;
      card.flip();
      // 翻转未固定牌 → 翻面后固定；翻转自己的固定牌 → 翻面并取消固定。
      card.fixed = !was_fixed;
      return true;
    }

    /** 固定：任意一张非固定颜色牌。 */
    _effect_fix(target) {
      var card = this._target_card(target);
      if (card === null || card.fixed) return false;
      card.fixed = true;
      return true;
    }

    /** 移除：任意一张颜色牌（含固定牌、身份牌）。 */
    _effect_remove(target) {
      var zone = toInt(dget(target, "zone", -1));
      var seat = toInt(dget(target, "seat", -1));
      var slot = toInt(dget(target, "slot", -1));
      var card = this._target_card(target);
      if (card === null) return false;
      if (zone === Z_IDENTITY) {
        this.players[seat].identity = null; // 身份牌移除后身份区为空
        this._to_color_discard(card);
        return true;
      }
      if (zone === Z_DRAW) {
        eraseRef(this.players[seat].draw, card);
        this._to_color_discard(card);
        return true;
      }
      if (zone === Z_MATCH) {
        if (slot < 0 || slot >= D.MATCH_SLOTS) return false;
        this.match_slots[slot] = null;
        this._to_color_discard(card);
        return true;
      }
      return false;
    }

    /** 按 target 结构定位一张颜色牌；找不到返回 null。 */
    _target_card(target) {
      var zone = toInt(dget(target, "zone", -1));
      var seat = toInt(dget(target, "seat", -1));
      var slot = toInt(dget(target, "slot", -1));
      var uid = toInt(dget(target, "card_uid", -1));
      if (zone === Z_IDENTITY) {
        if (seat < 0 || seat >= this.players.length) return null;
        var idc = this.players[seat].identity;
        if (idc !== null && idc.uid === uid) return idc;
        return null;
      }
      if (zone === Z_DRAW) {
        return this._find_draw_card(seat, uid);
      }
      if (zone === Z_MATCH) {
        if (slot < 0 || slot >= D.MATCH_SLOTS) return null;
        var mc = this.match_slots[slot];
        if (mc !== null && mc.uid === uid) return mc;
        return null;
      }
      return null;
    }

    // =============================================================
    // 查询辅助
    // =============================================================

    /** 快照。viewer=-1 上帝视角；viewer=seat 时隐藏其他玩家手牌与卡牌背面颜色。 */
    get_snapshot(viewer) {
      var view = viewer === undefined ? -1 : toInt(viewer);
      var god = view === -1;
      var player_list = [];
      for (var pi = 0; pi < this.players.length; pi++) {
        var p = this.players[pi];
        var own = god || view === p.seat;
        var draw_snaps = [];
        for (var di = 0; di < p.draw.length; di++) draw_snaps.push(p.draw[di].dup_data(own));
        var identity_snap = p.identity !== null ? p.identity.dup_data(own) : null;
        player_list.push({
          seat: p.seat,
          name: p.name,
          is_ai: p.is_ai,
          personal: p.personal,
          identity: identity_snap,
          draw: draw_snaps,
          hand_count: p.hand.length,
          hand: own ? p.hand.slice() : [],
          is_turn: this.phase === PH_ACTION && this.turn_seat === p.seat,
          is_winner: this.winners.indexOf(p.seat) >= 0,
        });
      }
      var match_snaps = [];
      for (var slot = 0; slot < D.MATCH_SLOTS; slot++) {
        var card = this.match_slots[slot];
        if (card === null) {
          match_snaps.push(null);
        } else {
          match_snaps.push(card.dup_data(god || view === card.owner));
        }
      }
      return {
        round: this.round,
        turn_seat: this.turn_seat,
        first_seat: this.first_seat,
        phase: this.phase,
        matcher: this.matcher,
        responder: this.get_current_responder(),
        active_colors: this.active_colors(),
        match: match_snaps,
        players: player_list,
        game_over: this.game_over,
        winners: this.winners.slice(),
        win_reasons: this.win_reasons.slice(),
        log: this.log_lines.slice(),
      };
    }

    /** 本局活跃颜色：前 color_count 种（颜色数可与人数不同，2~4）。 */
    active_colors() {
      var out = [];
      var count = toInt(dget(this.config, "color_count", this.players.length));
      count = clampi(count, 2, D.COLOR_COUNT);
      for (var i = 0; i < count; i++) out.push(i);
      return out;
    }

    player_name(seat) {
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length) return "玩家" + (s + 1);
      return this.players[s].name;
    }

    /** 按 uid 找颜色牌；owner_hint 为期望持有者。找不到返回 null。 */
    card_by_uid(uid, owner_hint) {
      var u = toInt(uid);
      var hint = owner_hint === undefined ? -1 : toInt(owner_hint);
      if (hint >= 0 && hint < this.players.length) {
        var found = this._card_in_player(this.players[hint], u);
        if (found !== null) return found;
      }
      for (var pi = 0; pi < this.players.length; pi++) {
        var found2 = this._card_in_player(this.players[pi], u);
        if (found2 !== null) return found2;
      }
      for (var slot = 0; slot < D.MATCH_SLOTS; slot++) {
        var card = this.match_slots[slot];
        if (card !== null && card.uid === u) return card;
      }
      for (var di = 0; di < this.color_discard.length; di++) {
        if (this.color_discard[di].uid === u) return this.color_discard[di];
      }
      for (var ci = 0; ci < this.color_deck.length; ci++) {
        if (this.color_deck[ci].uid === u) return this.color_deck[ci];
      }
      return null;
    }

    _card_in_player(p, uid) {
      if (p.identity !== null && p.identity.uid === uid) return p.identity;
      for (var ci = 0; ci < p.draw.length; ci++) {
        if (p.draw[ci].uid === uid) return p.draw[ci];
      }
      return null;
    }

    // =============================================================
    // 洗牌 / 抽牌 / 弃牌
    // =============================================================
    _build_color_deck() {
      this.color_deck = [];
      this.color_discard = [];
      var colors = this.active_colors();
      for (var ci = 0; ci < colors.length; ci++) {
        var c = colors[ci];
        for (var i = 0; i < D.COLOR_SAME_COPIES; i++) {
          this.color_deck.push(this._new_color_card(c, c));
        }
      }
      for (var ai = 0; ai < colors.length; ai++) {
        var a = colors[ai];
        for (var bi = 0; bi < colors.length; bi++) {
          var b = colors[bi];
          if (a === b) continue;
          for (var k = 0; k < D.COLOR_PAIR_COPIES; k++) {
            this.color_deck.push(this._new_color_card(a, b));
          }
        }
      }
      this._shuffle_cards(this.color_deck);
    }

    _build_action_deck() {
      this.action_deck = [];
      this.action_discard = [];
      for (var action = 0; action < D.ACTION_DECK_COUNTS.length; action++) {
        var count = toInt(D.ACTION_DECK_COUNTS[action]);
        for (var i = 0; i < count; i++) this.action_deck.push(action);
      }
      this._shuffle_ints(this.action_deck);
    }

    _new_color_card(front, back) {
      var c = new CardClass();
      c.uid = this._next_uid;
      this._next_uid += 1;
      c.sides = [toInt(front), toInt(back)];
      c.face_up = 0;
      c.owner = -1;
      c.zone = Z_DECK;
      c.fixed = false;
      return c;
    }

    /** 从颜色牌堆顶抽一张；牌堆空时把弃牌堆洗回。都空返回 null。 */
    _draw_color_card() {
      if (this.color_deck.length === 0) {
        if (!this._reshuffle_color_deck()) return null;
      }
      return this.color_deck.pop();
    }

    /** 从行动牌堆顶抽一张；牌堆空时把弃牌堆洗回。都空返回 -1。 */
    _draw_action_card() {
      if (this.action_deck.length === 0) {
        if (!this._reshuffle_action_deck()) return -1;
      }
      return this.action_deck.pop();
    }

    _reshuffle_color_deck() {
      if (this.color_discard.length === 0) return false;
      for (var ci = 0; ci < this.color_discard.length; ci++) {
        var card = this.color_discard[ci];
        card.zone = Z_DECK;
        card.fixed = false;
        this.color_deck.push(card);
      }
      this.color_discard = [];
      this._shuffle_cards(this.color_deck);
      this._log("颜色牌堆耗尽，颜色弃牌堆 " + this.color_deck.length + " 张洗回牌堆");
      return true;
    }

    _reshuffle_action_deck() {
      if (this.action_discard.length === 0) return false;
      for (var i = 0; i < this.action_discard.length; i++) this.action_deck.push(toInt(this.action_discard[i]));
      this.action_discard = [];
      this._shuffle_ints(this.action_deck);
      this._log("行动牌堆耗尽，行动弃牌堆 " + this.action_deck.length + " 张洗回牌堆");
      return true;
    }

    _to_color_discard(card) {
      card.fixed = false; // 固定牌离开原区域进入弃牌堆时，固定状态消失
      card.zone = Z_DISCARD;
      this.color_discard.push(card);
    }

    _to_action_discard(action) {
      this.action_discard.push(toInt(action));
    }

    /** Fisher-Yates 洗牌（使用内部 rng，保证可复现）。 */
    _shuffle_cards(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = this.rng.randi_range(0, i);
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
    }

    _shuffle_ints(arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = this.rng.randi_range(0, i);
        var tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
    }

    // =============================================================
    // 文案 / 通用工具
    // =============================================================
    _log(text) {
      this.log_lines.push(text);
      while (this.log_lines.length > D.LOG_CAP) this.log_lines.shift();
    }

    _card_label(card) {
      return this._card_label_color(card.color_up());
    }

    _card_label_color(color) {
      return "「" + D.color_name(color) + "」";
    }

    /** 文案里对「操作者本人」的称呼：真人玩家「你」，AI「自己」。 */
    _self_label(actor) {
      var a = toInt(actor);
      if (a < 0 || a >= this.players.length) return "你";
      return this.players[a].is_ai ? "自己" : "你";
    }

    /** 抽牌区牌的文案：seat 为抽牌区所属座位。 */
    _draw_ref(seat, card, actor) {
      var s = toInt(seat);
      var a = toInt(actor);
      var who = s === a ? this._self_label(a) : this.players[s].name + " ";
      return who + "抽牌区的" + this._card_label(card);
    }

    /** 身份牌的文案：seat 为身份区所属座位。 */
    _identity_ref(seat, card, actor) {
      var s = toInt(seat);
      var a = toInt(actor);
      var who = s === a ? this._self_label(a) : this.players[s].name + " ";
      return who + "的身份牌" + this._card_label(card);
    }

    /** 身份区的文案：seat 为身份区所属座位。 */
    _identity_zone_ref(seat, actor) {
      var s = toInt(seat);
      var a = toInt(actor);
      var who = s === a ? this._self_label(a) : this.players[s].name + " ";
      return who + "的身份区";
    }

    /** 配牌区牌的文案。 */
    _match_ref(slot, card) {
      return "配牌区 " + D.slot_mark(slot) + " 的" + this._card_label(card);
    }

    /** 按区域生成一张颜色牌的文案。 */
    _zone_card_ref(zone, seat, slot, card, actor) {
      if (zone === Z_IDENTITY) return this._identity_ref(seat, card, actor);
      if (zone === Z_DRAW) return this._draw_ref(seat, card, actor);
      if (zone === Z_MATCH) return this._match_ref(slot, card);
      return this._card_label(card);
    }

    /** 遍历场上全部颜色牌（身份牌 → 抽牌区 → 配牌区）。callback(zone, seat, slot, card)。 */
    _for_each_color_card(callback) {
      var i;
      var pi;
      var p;
      var c;
      for (pi = 0; pi < this.players.length; pi++) {
        p = this.players[pi];
        if (p.identity !== null) callback(Z_IDENTITY, pi, -1, p.identity);
      }
      for (pi = 0; pi < this.players.length; pi++) {
        p = this.players[pi];
        for (i = 0; i < p.draw.length; i++) callback(Z_DRAW, pi, -1, p.draw[i]);
      }
      for (i = 0; i < D.MATCH_SLOTS; i++) {
        c = this.match_slots[i];
        if (c !== null) callback(Z_MATCH, c.owner, i, c);
      }
    }

    _join_names(names) {
      var s = "";
      for (var i = 0; i < names.length; i++) {
        if (i > 0) s += "、";
        s += names[i];
      }
      return s;
    }

    _find_draw_card(seat, uid) {
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length) return null;
      var draw = this.players[s].draw;
      for (var ci = 0; ci < draw.length; ci++) {
        if (draw[ci].uid === uid) return draw[ci];
      }
      return null;
    }

    /** target 相等判断：expected 的每个字段都必须在 actual 中存在且严格相等（允许多余字段）。 */
    _target_eq(expected, actual) {
      var keys = Object.keys(expected);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!hasOwn(actual, k)) return false;
        if (expected[k] !== actual[k]) return false;
      }
      return true;
    }

    _match_hand_option(options, action, hand_index, target) {
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        if (toInt(dget(opt, "action", -1)) !== action) continue;
        if (toInt(dget(opt, "hand_index", -1)) !== hand_index) continue;
        var opt_target = dget(opt, "target", {});
        if (!isPlainDict(opt_target)) continue;
        if (this._target_eq(opt_target, target)) return opt;
      }
      return null;
    }

    _match_free_option(options, action, target) {
      for (var i = 0; i < options.length; i++) {
        var opt = options[i];
        if (toInt(dget(opt, "action", -1)) !== action) continue;
        var opt_target = dget(opt, "target", {});
        if (!isPlainDict(opt_target)) continue;
        if (this._target_eq(opt_target, target)) return opt;
      }
      return null;
    }

    // =============================================================
    // 测试辅助（tests/ 专用；不参与 UI/AI 契约）
    // =============================================================

    /** 直接构造一张颜色牌（不加入任何牌堆），供测试摆场景。sides 为 [正面, 背面]。 */
    debug_make_card(sides, card_owner, card_zone, side_up) {
      var card_owner_v = card_owner === undefined ? -1 : toInt(card_owner);
      var card_zone_v = card_zone === undefined ? Z_DRAW : toInt(card_zone);
      var side_up_v = side_up === undefined ? 0 : side_up;
      var front = Array.isArray(sides) && sides.length > 0 ? toInt(sides[0]) : 0;
      var back = Array.isArray(sides) && sides.length > 1 ? toInt(sides[1]) : front;
      var c = this._new_color_card(front, back);
      c.owner = card_owner_v;
      c.zone = card_zone_v;
      c.face_up = clampi(side_up_v, 0, 1);
      return c;
    }

    /** 覆盖若干公开字段，供测试构造局面。 */
    debug_set_state(state) {
      if (!isPlainDict(state)) return;
      var keys = Object.keys(state);
      for (var i = 0; i < keys.length; i++) {
        var key = String(keys[i]);
        var value = state[keys[i]];
        switch (key) {
          case "round":
            this.round = toInt(value);
            break;
          case "turn_seat":
            this.turn_seat = toInt(value);
            break;
          case "first_seat":
            this.first_seat = toInt(value);
            break;
          case "phase":
            this.phase = toInt(value);
            break;
          case "matcher":
            this.matcher = toInt(value);
            break;
          case "action_done":
            this._action_done = !!value;
            break;
          case "game_over":
            this.game_over = !!value;
            break;
          case "personal": {
            var personal_arr = Array.isArray(value) ? value : [];
            for (var pi = 0; pi < mini(personal_arr.length, this.players.length); pi++) {
              this.players[pi].personal = toInt(personal_arr[pi]);
            }
            break;
          }
          case "clear_log":
            if (!!value) this.log_lines = [];
            break;
          default:
            break;
        }
      }
    }

    /** 覆盖某玩家手牌（test 专用）。 */
    debug_set_hand(seat, actions) {
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length) return;
      var p = this.players[s];
      p.hand = [];
      if (!Array.isArray(actions)) return;
      for (var i = 0; i < actions.length; i++) p.hand.push(toInt(actions[i]));
    }

    /** 覆盖某玩家抽牌区（test 专用）。cards 元素为 KKCard。 */
    debug_set_draw(seat, cards) {
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length) return;
      var p = this.players[s];
      p.draw = [];
      if (!Array.isArray(cards)) return;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (isCardLike(card)) {
          card.owner = s;
          card.zone = Z_DRAW;
          p.draw.push(card);
        }
      }
    }

    /** 旧版响应槽已移除：保留空实现，兼容旧测试接口名。 */
    debug_set_response(_seat, _action) {
      // 新规则没有暗置/响应槽，这里不做任何事。
    }

    /** 设置身份牌两面颜色（test 专用）；身份区为空时会新建一张身份牌。 */
    debug_set_identity(seat, front, back, face_up) {
      var s = toInt(seat);
      if (s < 0 || s >= this.players.length) return;
      var p = this.players[s];
      var up = face_up === undefined ? 0 : clampi(face_up, 0, 1);
      if (p.identity === null) {
        var c = this._new_color_card(toInt(front), toInt(back));
        c.owner = s;
        c.zone = Z_IDENTITY;
        c.face_up = up;
        p.identity = c;
        return;
      }
      p.identity.sides = [toInt(front), toInt(back)];
      p.identity.face_up = up;
    }

    /** 覆盖配牌区（test 专用）。slots 长度 2，元素为 null 或 KKCard。 */
    debug_set_match_slots(slots) {
      var list = Array.isArray(slots) ? slots : [];
      for (var i = 0; i < D.MATCH_SLOTS; i++) {
        var card = i < list.length ? list[i] : null;
        if (card !== null && card !== undefined) {
          card.zone = Z_MATCH;
        } else {
          card = null;
        }
        this.match_slots[i] = card;
      }
    }
  }

  // =============================================================
  // 挂全局
  // =============================================================
  global.KKGame = KKGame;
})(typeof window !== "undefined" ? window : globalThis);
