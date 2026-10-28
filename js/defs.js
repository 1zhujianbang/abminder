/* 《卡卡牌 CCaarrddss》HTML Demo — 全局定义（defs.js）
 * 枚举/牌面/PRNG 定义；规则语义见 docs/RULES.md（新版规则）与 web/js/engine.js。
 *   scripts/core/kk_defs.gd  → KKDefs（枚举/文案基线）
 *   scripts/core/kk_card.gd  → KKCard
 *   scripts/core/kk_player.gd→ KKPlayer
 * 另含确定性种子 PRNG：KKRNG（对应引擎内部 rng；Godot RandomNumberGenerator 的可复现替身）。
 *
 * classic script + IIFE，挂到 window（浏览器）或 globalThis（Node vm）。
 * 本文件不含任何 DOM/BOM API。所有随机性必须走 KKRNG，不得使用 Math.random。
 */
(function (global) {
  "use strict";

  // =============================================================
  // 通用小工具（模拟 GDScript 的 int()/clampi() 语义）
  // =============================================================
  function toInt(value) {
    if (typeof value === "number") {
      var n = Math.trunc(value);
      return n === 0 ? 0 : n; // 同时把 -0 归一为 0
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

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  // =============================================================
  // 枚举（数值必须与 kk_defs.gd 一致）
  // =============================================================
  var KColor = { RED: 0, YELLOW: 1, BLUE: 2, GREEN: 3, PURPLE: 4, ORANGE: 5 };
  var Action = { MOVE: 0, REPLACE: 1, FLIP: 2, MATCH: 3, FIX: 4, REMOVE: 5 };
  var Zone = { DECK: 0, DRAW: 1, IDENTITY: 2, MATCH: 3, DISCARD: 4 };
  var Phase = { SETUP: 0, ACTION: 1, RESPONSE: 2, GAME_OVER: 3 };

  // =============================================================
  // 名称与文案
  // =============================================================
  var COLOR_COUNT = 6;
  var COLOR_NAMES = ["红", "黄", "蓝", "绿", "紫", "橙"];
  var COLOR_NAMES_EN = ["Red", "Yellow", "Blue", "Green", "Purple", "Orange"];
  var ACTION_NAMES = ["移动", "替换", "翻转", "配对", "固定", "移除"];
  var ACTION_DESCS = [
    "免费动作：把自己抽牌区的牌或任意玩家的身份牌移到空槽（配牌区空槽 / 空身份区）",
    "免费动作：用自己抽牌区的一张牌替换有牌的配牌槽或身份牌（旧牌进颜色弃牌堆）",
    "免费动作：翻转任意一张非固定颜色牌（身份牌 / 抽牌区 / 配牌区）",
    "配牌区两个槽都有牌时打出：所有玩家依次响应一次后结算颜色",
    "固定任意一张非固定颜色牌：不能被移动/替换/翻转，但可以被移除",
    "移除任意一张颜色牌（含固定牌、身份牌；身份牌移除后身份区为空）",
  ];
  var PLAYER_NAME_HUMAN = "你";
  var AI_NAMES = ["电脑A", "电脑B", "电脑C"];

  // =============================================================
  // 规则数值
  // =============================================================
  var WIN_SCORE = 5;
  var DRAW_AREA_CAP = 3;
  var HAND_CAP = 4;
  var HAND_START = 3;
  var MATCH_SLOTS = 2;
  var LOG_CAP = 200;
  var SLOT_MARKS = ["①", "②"];

  // =============================================================
  // 1.9 牌堆配置（可调优，引擎其余部分自动适配）
  // =============================================================
  var COLOR_SAME_COPIES = 3;
  var COLOR_PAIR_COPIES = 2;
  // 行动牌 30 张：配对 10、固定 10、移除 10（移动/替换/翻转为免费动作，不再有行动牌）。
  var ACTION_DECK_COUNTS = [0, 0, 0, 10, 10, 10];

  // =============================================================
  // KKDefs：常量与静态工具函数
  // =============================================================
  var KKDefs = {
    // 枚举
    KColor: KColor,
    Action: Action,
    Zone: Zone,
    Phase: Phase,

    // 名称/文案
    COLOR_COUNT: COLOR_COUNT,
    COLOR_NAMES: COLOR_NAMES,
    COLOR_NAMES_EN: COLOR_NAMES_EN,
    ACTION_NAMES: ACTION_NAMES,
    ACTION_DESCS: ACTION_DESCS,
    PLAYER_NAME_HUMAN: PLAYER_NAME_HUMAN,
    AI_NAMES: AI_NAMES,

    // 规则数值
    WIN_SCORE: WIN_SCORE,
    DRAW_AREA_CAP: DRAW_AREA_CAP,
    HAND_CAP: HAND_CAP,
    HAND_START: HAND_START,
    MATCH_SLOTS: MATCH_SLOTS,
    LOG_CAP: LOG_CAP,
    SLOT_MARKS: SLOT_MARKS,

    // 牌堆配置
    COLOR_SAME_COPIES: COLOR_SAME_COPIES,
    COLOR_PAIR_COPIES: COLOR_PAIR_COPIES,
    ACTION_DECK_COUNTS: ACTION_DECK_COUNTS,

    // ---- 函数 ----
    color_names: function () {
      return COLOR_NAMES.slice();
    },

    action_names: function () {
      return ACTION_NAMES.slice();
    },

    /** 默认玩家名：人类叫「你」；AI 按座位顺序取 电脑A/B/C…（默认人类坐 seat 0）。 */
    player_name: function (seat, is_ai) {
      if (!is_ai) return PLAYER_NAME_HUMAN;
      return KKDefs.ai_name(toInt(seat) - 1);
    },

    /** 第 index 个 AI（0 起）的默认名字，超过 AI_NAMES 数量时退化为 电脑D/电脑E… */
    ai_name: function (index) {
      var i = toInt(index);
      if (i >= 0 && i < AI_NAMES.length) return AI_NAMES[i];
      var code = 65 + clampi(i, 0, 25); // 'A'..'Z'
      return "电脑" + String.fromCharCode(code);
    },

    color_name: function (color) {
      var c = toInt(color);
      if (c < 0 || c >= COLOR_NAMES.length) return "?";
      return COLOR_NAMES[c];
    },

    action_name: function (action) {
      var a = toInt(action);
      if (a < 0 || a >= ACTION_NAMES.length) return "?";
      return ACTION_NAMES[a];
    },

    action_desc: function (action) {
      var a = toInt(action);
      if (a < 0 || a >= ACTION_DESCS.length) return "";
      return ACTION_DESCS[a];
    },

    /** 配牌区槽位符号：① ②。 */
    slot_mark: function (slot) {
      var s = toInt(slot);
      if (s < 0 || s >= SLOT_MARKS.length) return "?";
      return SLOT_MARKS[s];
    },

    /** 颜色牌堆总张数（按活跃颜色数，与实际生成逻辑一致）。 */
    color_deck_size: function (color_count) {
      var n = clampi(color_count, 2, 4);
      return COLOR_SAME_COPIES * n + COLOR_PAIR_COPIES * n * (n - 1);
    },

    /** 行动牌堆总张数。 */
    action_deck_size: function () {
      var total = 0;
      for (var i = 0; i < ACTION_DECK_COUNTS.length; i++) {
        total += toInt(ACTION_DECK_COUNTS[i]);
      }
      return total;
    },
  };

  // =============================================================
  // KKRNG：确定性种子 PRNG（splitmix32 播种 + mulberry32 序列）
  //   const rng = new KKRNG(12345);
  //   rng.seed = 12345;      // setter：重置状态，可复现
  //   rng.seed;              // getter
  //   rng.randi_range(a, b); // 闭区间 [a,b] 整数
  //   rng.randf();           // [0,1) 浮点
  // 同 seed 两个实例序列相同；不同 seed 输出不同。
  // =============================================================
  function mix32(seedValue) {
    var low = seedValue >>> 0;
    var high = Math.floor(seedValue / 4294967296) >>> 0;
    var x = (low ^ high) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0;
    x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    return x;
  }

  function KKRNG(seed) {
    this._seed = 0;
    this._state = 0;
    if (seed === undefined) {
      this.seed = 12345;
    } else {
      this.seed = seed;
    }
  }

  Object.defineProperty(KKRNG.prototype, "seed", {
    get: function () {
      return this._seed;
    },
    set: function (value) {
      var s = toInt(value);
      this._seed = s;
      this._state = mix32(s);
    },
    configurable: true,
    enumerable: false,
  });

  /** 内部：下一个 32 位无符号整数（mulberry32）。 */
  KKRNG.prototype._next = function () {
    this._state = (this._state + 0x6d2b79f5) | 0;
    var t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  /** [0,1) 浮点。 */
  KKRNG.prototype.randf = function () {
    return this._next() / 4294967296;
  };

  /** [0, 2^32-1] 整数。 */
  KKRNG.prototype.randi = function () {
    return this._next();
  };

  /** 闭区间 [a,b] 整数；a > b 时自动交换（防止死循环/异常）。 */
  KKRNG.prototype.randi_range = function (a, b) {
    var lo = toInt(a);
    var hi = toInt(b);
    if (lo > hi) {
      var tmp = lo;
      lo = hi;
      hi = tmp;
    }
    var span = hi - lo + 1;
    if (span <= 1) return lo;
    if (span <= 4294967296) {
      return lo + (this._next() % span);
    }
    return lo + Math.floor(this.randf() * span);
  };

  // =============================================================
  // KKCard：颜色牌（双面）
  //   uid / sides=[front,back] / face_up(0|1) / owner / zone / fixed
  // =============================================================
  class KKCard {
    constructor(init) {
      var source = init;
      if (Array.isArray(source)) source = { sides: source };
      if (!source || typeof source !== "object") source = {};
      this.uid = hasOwn(source, "uid") ? toInt(source.uid) : 0;
      var s = Array.isArray(source.sides) ? source.sides : [0, 0];
      this.sides = [toInt(s.length > 0 ? s[0] : 0), toInt(s.length > 1 ? s[1] : (s.length > 0 ? s[0] : 0))];
      this.face_up = hasOwn(source, "face_up") ? clampi(source.face_up, 0, 1) : 0;
      this.owner = hasOwn(source, "owner") ? toInt(source.owner) : -1;
      this.zone = hasOwn(source, "zone") ? toInt(source.zone) : Zone.DECK;
      this.fixed = hasOwn(source, "fixed") ? !!source.fixed : false;
    }

    /** 当前朝上的颜色（公开信息）。 */
    color_up() {
      return this.sides[this.face_up];
    }

    /** 当前朝下的颜色（背面，仅持有人可看）。 */
    color_down() {
      return this.sides[1 - this.face_up];
    }

    /** 翻到另一面。 */
    flip() {
      this.face_up = 1 - this.face_up;
    }

    /** 快照数据：show_down=true 时带出背面颜色（仅限本人/上帝视角调用）。 */
    dup_data(show_down) {
      var show = !!show_down;
      return {
        uid: this.uid,
        color: this.color_up(),
        other_color: show ? this.color_down() : -1,
        owner: this.owner,
        fixed: this.fixed,
        zone: this.zone,
      };
    }
  }

  // =============================================================
  // KKPlayer：玩家状态
  //   identity(KKCard|null) / draw(KKCard[]) / hand(number[]) / personal
  //   注：response 字段为旧版「响应槽」遗留，新规则已无响应槽，引擎不再使用。
  // =============================================================
  class KKPlayer {
    constructor(init) {
      var source = init && typeof init === "object" ? init : {};
      this.seat = hasOwn(source, "seat") ? toInt(source.seat) : 0;
      this.name = hasOwn(source, "name") ? String(source.name) : "";
      this.is_ai = hasOwn(source, "is_ai") ? !!source.is_ai : false;
      this.identity = hasOwn(source, "identity") ? (source.identity || null) : null;
      this.draw = Array.isArray(source.draw) ? source.draw.slice() : [];
      this.hand = Array.isArray(source.hand) ? source.hand.map(toInt) : [];
      this.response = hasOwn(source, "response") ? toInt(source.response) : -1;
      this.personal = hasOwn(source, "personal") ? toInt(source.personal) : 0;
    }
  }

  // =============================================================
  // 挂全局
  // =============================================================
  global.KKDefs = KKDefs;
  global.KKRNG = KKRNG;
  global.KKCard = KKCard;
  global.KKPlayer = KKPlayer;
})(typeof window !== "undefined" ? window : globalThis);
