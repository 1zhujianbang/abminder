/**
 * 《卡卡牌》核心玩法 Demo —— 界面渲染 + 人类玩家控制器
 *
 * 职责：
 * - 只读引擎快照 / 公开字段，只调用公开 API；绝不直接修改引擎状态。
 * - 渲染菜单 / 对局界面，驱动完整回合制流程：
 *   人类回合（打出一张手牌，或执行移动/替换/翻转免费动作）
 *   → 配对响应窗口（全员按序直接参与，不暗置；人类模态 / AI 自动）
 *   → resolve_match → advance_turn → … → 终局。
 * - 实现 SPEC 3.5（URL 参数）与 3.6（DOM 契约 / window.KKApp）。
 *
 * 依赖（classic script，按 index.html 顺序加载，不使用模块）：
 *   js/defs.js  → window.KKDefs / window.KKCard / window.KKPlayer
 *   js/engine.js→ window.KKGame
 *   js/ai.js    → window.KKAI
 */
(function (global) {
  "use strict";

  /* ============================================================
   * 0. 通过全局对象访问引擎类（不假设模块导出）
   * ============================================================ */
  var env = {
    get KKDefs() { return global.KKDefs || null; },
    get KKGame() { return global.KKGame || null; },
    get KKAI() { return global.KKAI || null; }
  };

  /* ---------- 文案 / 图标 / 配色回退值（defs 未加载时也不会崩） ---------- */
  var FALLBACK_COLOR_NAMES = ["红", "黄", "蓝", "绿", "紫", "橙"];
  var FALLBACK_ACTION_NAMES = ["移动", "替换", "翻转", "配对", "固定", "移除"];
  var FALLBACK_ACTION_DESCS = [
    "免费动作：把自己抽牌区的牌或任意身份牌移进空槽（配牌区空槽 / 空身份区）",
    "免费动作：用自己抽牌区的一张牌替换有牌槽（配牌区或身份区）",
    "免费动作：翻转任意一张非固定颜色牌（身份牌 / 抽牌区 / 配牌区）",
    "配牌区两个槽都有牌时打出，先进入响应窗口，结束后再比较颜色",
    "固定任意一张非固定颜色牌：不可移动/替换/翻转，但仍可被移除",
    "移除任意一张颜色牌（含固定牌与身份牌）"
  ];
  var COLOR_CLASSES = ["c-red", "c-yellow", "c-blue", "c-green", "c-purple", "c-orange"];
  var COLOR_SHAPES = ["●", "▲", "■", "◆", "✚", "✖"];
  var ACTION_CLASSES = ["a-move", "a-replace", "a-flip", "a-match", "a-fix", "a-remove"];
  var ACTION_ICONS = ["→", "⇄", "↻", "◎", "▣", "✕"];

  /* ============================================================
   * 1. 运行状态（唯一的可变状态容器；不触碰引擎内部）
   * ============================================================ */
  var S = {
    /* 屏幕与流程 */
    screen: "menu",
    turnState: "menu",
    game: null,
    snapshot: null,
    humanSeat: 0,
    cfg: null,
    session: 0,
    timer: null,
    timerToken: 0,
    busy: false,

    /* 菜单设置 */
    menu: { players: 3, colors: 3, difficulty: 1, seed: 0, colorsTouched: false },

    /* URL 参数 */
    fast: false,
    aiDelay: 750,

    /* 人类交互 */
    selectedHandIndex: -1,
    selectedFreeAction: -1,
    selectedSource: null,     /* 两步点击：移动/替换当前已选来源 {zone,seat,uid} */
    dragKind: "",             /* 拖拽类型："free" 免费动作 / "hand" 手牌 / "" */
    dragSource: null,         /* 免费动作拖拽来源 {zone,seat,uid} */
    dragHandIndex: -1,        /* 手牌拖拽：手牌下标 */
    dragHandEl: null,         /* 手牌拖拽元素（用于清理 .is-dragging） */
    dragTargetEl: null,       /* 当前 dragover 高亮元素 */
    fieldHint: "",            /* 场上点击/拖拽的即时提示 */
    legalActions: [],
    freeActions: [],
    responseOptions: [],
    responseSource: null,     /* 响应窗口两步点击：已选来源 {zone,seat,uid} */

    /* 展示信息 */
    lastEvent: "",
    lastMatchResult: null,
    lastTurnReport: null,
    rulesOpen: false,
    lastError: null,

    /* 渲染缓存 */
    dom: {},
    targetEls: []
  };

  /* ============================================================
   * 2. 小工具
   * ============================================================ */
  function $id(id) { return document.getElementById(id); }

  function setText(el, text) {
    if (el) el.textContent = text === undefined || text === null ? "" : String(text);
  }

  function setHidden(el, hidden) {
    if (el) el.hidden = !!hidden;
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number(n))); }

  function clampInt(value, def, lo, hi) {
    var n = parseInt(value, 10);
    if (!isFinite(n)) return def;
    return clamp(n, lo, hi);
  }

  function toIntOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = parseInt(value, 10);
    return isFinite(n) ? n : null;
  }

  function randomSeed() { return Math.floor(Math.random() * 999999) + 1; }

  function safeArray(v) { return Array.isArray(v) ? v : []; }

  /** 原生 DOM 构造助手：h("div", {class, dataset, on, ...}, child, ...) */
  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      for (var key in props) {
        if (!Object.prototype.hasOwnProperty.call(props, key)) continue;
        var value = props[key];
        if (value === undefined || value === null) continue;
        if (key === "class") {
          el.className = value;
        } else if (key === "text") {
          el.textContent = String(value);
        } else if (key === "dataset") {
          for (var dk in value) {
            if (!Object.prototype.hasOwnProperty.call(value, dk)) continue;
            if (value[dk] === undefined || value[dk] === null) continue;
            el.dataset[dk] = String(value[dk]);
          }
        } else if (key === "style") {
          el.setAttribute("style", String(value));
        } else if (key === "on") {
          for (var ev in value) {
            if (!Object.prototype.hasOwnProperty.call(value, ev)) continue;
            if (typeof value[ev] === "function") el.addEventListener(ev, value[ev]);
          }
        } else if (value === false) {
          continue;
        } else if (value === true) {
          el.setAttribute(key, "");
        } else {
          el.setAttribute(key, String(value));
        }
      }
    }
    for (var i = 2; i < arguments.length; i++) appendChild(el, arguments[i]);
    return el;
  }

  function appendChild(el, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) {
      for (var i = 0; i < child.length; i++) appendChild(el, child[i]);
      return;
    }
    if (typeof child === "string" || typeof child === "number") {
      el.appendChild(document.createTextNode(String(child)));
      return;
    }
    el.appendChild(child);
  }

  function clearNode(el) {
    if (!el) return;
    if (el.replaceChildren) { el.replaceChildren(); return; }
    el.textContent = "";
  }

  /* ============================================================
   * 3. defs 读取助手
   * ============================================================ */
  function defs() {
    var d = env.KKDefs;
    if (!d) throw new Error("KKDefs 未加载（js/defs.js 缺失）");
    return d;
  }

  function phaseEnum() {
    var d = env.KKDefs;
    if (d && d.Phase) return d.Phase;
    return { SETUP: 0, ACTION: 1, RESPONSE: 2, GAME_OVER: 3 };
  }

  function actionEnum() {
    var d = env.KKDefs;
    if (d && d.Action) return d.Action;
    return { MOVE: 0, REPLACE: 1, FLIP: 2, MATCH: 3, FIX: 4, REMOVE: 5 };
  }

  function winScore() {
    var d = env.KKDefs;
    return d && typeof d.WIN_SCORE === "number" ? d.WIN_SCORE : 5;
  }

  function handCap() {
    var d = env.KKDefs;
    return d && typeof d.HAND_CAP === "number" ? d.HAND_CAP : 4;
  }

  function drawCap() {
    var d = env.KKDefs;
    return d && typeof d.DRAW_AREA_CAP === "number" ? d.DRAW_AREA_CAP : 3;
  }

  function colorName(c) {
    var d = env.KKDefs;
    if (d && typeof d.color_name === "function") return d.color_name(c);
    return FALLBACK_COLOR_NAMES[c] || "?";
  }

  function actionName(a) {
    var d = env.KKDefs;
    if (d && typeof d.action_name === "function") return d.action_name(a);
    return FALLBACK_ACTION_NAMES[a] || "?";
  }

  function actionDesc(a) {
    var d = env.KKDefs;
    if (d && typeof d.action_desc === "function") return d.action_desc(a);
    return FALLBACK_ACTION_DESCS[a] || "";
  }

  function slotMark(slot) {
    var d = env.KKDefs;
    if (d && typeof d.slot_mark === "function") return d.slot_mark(slot);
    return ["①", "②"][slot] || "?";
  }

  function colorClass(c) { return COLOR_CLASSES[c] || "c-unknown"; }
  function actionClass(a) { return ACTION_CLASSES[a] || "a-move"; }
  function colorShape(c) { return COLOR_SHAPES[c] || "?"; }
  function actionIcon(a) { return ACTION_ICONS[a] || "·"; }

  function phaseText(phase) {
    var P = phaseEnum();
    if (phase === P.ACTION) return "行动阶段";
    if (phase === P.RESPONSE) return "响应窗口";
    if (phase === P.GAME_OVER) return "对局结束";
    return "准备中";
  }

  /* ---------- 快照读取助手（只读） ---------- */
  function playerBySeat(snap, seat) {
    if (!snap || !Array.isArray(snap.players)) return null;
    for (var i = 0; i < snap.players.length; i++) {
      if (snap.players[i] && snap.players[i].seat === seat) return snap.players[i];
    }
    return null;
  }

  function playerName(seat) {
    var p = playerBySeat(S.snapshot, seat);
    if (p) return p.name;
    if (seat === S.humanSeat) return "你";
    return "玩家" + (seat + 1);
  }

  function newGameSnapshot() {
    if (!S.game) return null;
    try { return S.game.get_snapshot(S.humanSeat); } catch (err) { reportFatal("读取快照异常", err); return null; }
  }

  /** 当前响应者座位（-1 表示响应窗口结束）。以引擎 API 为准，兼容快照字段。 */
  function effectiveResponder() {
    var g = S.game;
    if (g && typeof g.get_current_responder === "function") {
      try {
        var r = g.get_current_responder();
        return typeof r === "number" ? r : -1;
      } catch (err) { /* 回退到快照 */ }
    }
    var snap = S.snapshot;
    return snap && typeof snap.responder === "number" ? snap.responder : -1;
  }

  /** 读取某座位的免费动作（移动/替换/翻转）。引擎未提供该 API 时返回空数组。 */
  function readFreeActions(seat) {
    var g = S.game;
    if (!g || typeof g.get_free_actions !== "function") return [];
    return safeArray(g.get_free_actions(seat));
  }

  /** 执行免费动作；返回 null 表示引擎尚未提供该 API。 */
  function performFreeActionApi(seat, option) {
    var g = S.game;
    if (!g || typeof g.perform_free_action !== "function") return null;
    return g.perform_free_action(seat, option);
  }

  /* ============================================================
   * 4. 错误处理（写入 window.KKApp.getLastError() + 可见错误条）
   * ============================================================ */
  function reportFatal(context, err) {
    var detail = "";
    if (err !== undefined && err !== null) {
      if (typeof err === "string") detail = err;
      else if (err.message) detail = String(err.message);
      else detail = String(err);
    }
    var msg = context ? (context + (detail ? "：" + detail : "")) : detail;
    if (!msg) msg = "未知错误";
    S.lastError = msg;
    var bar = $id("error-bar");
    var text = $id("error-text");
    setText(text, msg);
    setHidden(bar, false);
    try { console.error("[KKApp] " + msg); } catch (e) { /* ignore */ }
  }

  function hideErrorBar() {
    setHidden($id("error-bar"), true);
  }

  /* ============================================================
   * 5. URL 参数解析（SPEC 3.5）
   * ============================================================ */
  /**
   * @param {string} search location.search，例如 "?players=3&fast=1"
   * @param {number} fallbackSeed 缺省种子
   * @returns {{autostart:boolean, fast:boolean, cfg:Object, players:number, colors:number,
   *            difficulty:number, seed:number|null, colorsTouched:boolean, hasSeed:boolean}}
   */
  function parseUrlConfig(search, fallbackSeed) {
    var params = null;
    try { params = new URLSearchParams(search || ""); } catch (err) { params = null; }
    function get(name) { return params ? params.get(name) : null; }
    function intParam(name, def, lo, hi) {
      var raw = get(name);
      if (raw === null || raw === "") return def;
      var n = parseInt(raw, 10);
      if (!isFinite(n)) return def;
      return clamp(n, lo, hi);
    }

    var players = intParam("players", 3, 2, 4);

    var colorsTouched = false;
    var colors = Math.min(players, 4);
    var colorsRaw = get("colors");
    if (colorsRaw !== null && colorsRaw !== "") {
      var cn = parseInt(colorsRaw, 10);
      if (isFinite(cn)) {
        colors = clamp(cn, 2, 4);
        colorsTouched = true;
      }
    }

    var difficulty = intParam("difficulty", 1, 0, 2);

    var seed = null;
    var seedRaw = get("seed");
    if (seedRaw !== null && seedRaw !== "") {
      var sn = parseInt(seedRaw, 10);
      if (isFinite(sn)) seed = sn;
    }
    var hasSeed = seed !== null;
    if (!hasSeed) seed = fallbackSeed;

    var autostart = get("autostart") === "1" || get("autostart") === "true";
    var fast = get("fast") === "1" || get("fast") === "true";

    var cfg = {
      player_count: players,
      color_count: colors,
      ai_difficulty: difficulty,
      seed: seed,
      human_seat: 0,
      all_ai: false,
      first_seat: 0
    };

    return {
      autostart: autostart,
      fast: fast,
      cfg: cfg,
      players: players,
      colors: colors,
      difficulty: difficulty,
      seed: seed,
      colorsTouched: colorsTouched,
      hasSeed: hasSeed
    };
  }

  /** 归一化 startGame 入参（引擎自身也会夹取，这里保证 UI 侧一致）。 */
  function normalizeCfg(input) {
    input = input || {};
    var n = clampInt(input.player_count, 3, 2, 4);
    var cfg = {
      player_count: n,
      ai_difficulty: clampInt(input.ai_difficulty, 1, 0, 2),
      human_seat: clampInt(input.human_seat, 0, 0, n - 1),
      all_ai: false,
      first_seat: clampInt(input.first_seat, 0, 0, n - 1)
    };
    var colors = toIntOrNull(input.color_count);
    cfg.color_count = colors === null ? Math.min(n, 4) : clamp(colors, 2, 4);
    var seed = toIntOrNull(input.seed);
    cfg.seed = seed === null ? randomSeed() : seed;
    if (Array.isArray(input.names)) cfg.names = input.names.slice();
    return cfg;
  }

  /* ============================================================
   * 6. 选项比较（校验 AI 返回的选项确实是当前合法选项）
   * ============================================================ */
  /** 深度比较 target（普通对象 / 数组 / 原始值），用于校验 AI 返回的选项。 */
  function sameTarget(a, b) {
    if (a === b) return true;
    if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      for (var ai = 0; ai < a.length; ai++) {
        if (!sameTarget(a[ai], b[ai])) return false;
      }
      return true;
    }
    var ka = Object.keys(a);
    var kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      var k = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!sameTarget(a[k], b[k])) return false;
    }
    return true;
  }

  function findOption(options, option) {
    if (!option || !Array.isArray(options)) return null;
    var action = option.action;
    var handIndex = option.hand_index;
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (!o || o.action !== action) continue;
      if (handIndex !== undefined && o.hand_index !== undefined && o.hand_index !== handIndex) continue;
      if (sameTarget(o.target || {}, option.target || {})) return o;
    }
    return null;
  }

  /* ============================================================
   * 7. 页面骨架缓存 / 初始化
   * ============================================================ */
  function cacheDom() {
    S.dom = {
      screenMenu: $id("screen-menu"),
      screenGame: $id("screen-game"),
      opponents: $id("opponents"),
      matchSlots: $id("match-slots"),
      matchStatus: $id("match-status"),
      piles: $id("piles"),
      log: $id("log"),
      logCount: $id("log-count"),
      hintEvent: $id("hint-event"),
      hintState: $id("hint-state"),
      turnBanner: $id("turn-banner"),
      roundBadge: $id("round-badge"),
      hdrRound: $id("hdr-round"),
      hdrTurn: $id("hdr-turn"),
      hdrPhase: $id("hdr-phase"),
      phaseBadge: $id("phase-badge"),
      humanArea: $id("human-area"),
      modalRoot: $id("modal-root"),
      rulesModal: $id("rules-modal"),
      segPlayers: $id("seg-players"),
      segColors: $id("seg-colors"),
      segDifficulty: $id("seg-difficulty"),
      seedInput: $id("seed-input"),
      startBtn: $id("start-game")
    };
  }

  function bindStaticEvents() {
    if (S.dom.startBtn) S.dom.startBtn.addEventListener("click", onStartGameClick);

    bindSegButtons(S.dom.segPlayers, function (value) { onPlayersPicked(value); });
    bindSegButtons(S.dom.segColors, function (value) { onColorsPicked(value); });
    bindSegButtons(S.dom.segDifficulty, function (value) { onDifficultyPicked(value); });

    var dice = $id("seed-random");
    if (dice) {
      dice.addEventListener("click", function () {
        S.menu.seed = randomSeed();
        updateMenuUI();
      });
    }

    var rulesBtn = $id("btn-rules");
    if (rulesBtn) rulesBtn.addEventListener("click", openRules);
    var newGameBtn = $id("btn-new-game");
    if (newGameBtn) newGameBtn.addEventListener("click", backToMenu);
    var rulesClose = $id("rules-close");
    if (rulesClose) rulesClose.addEventListener("click", closeRules);
    if (S.dom.rulesModal) {
      S.dom.rulesModal.addEventListener("click", function (ev) {
        if (ev && ev.target === S.dom.rulesModal) closeRules();
      });
    }
    var errDismiss = $id("error-dismiss");
    if (errDismiss) errDismiss.addEventListener("click", hideErrorBar);

    /* 拖拽：松开在非目标区域时清理高亮，避免残留 */
    document.addEventListener("drop", function (ev) {
      if (ev && ev.preventDefault) ev.preventDefault();
      endDragVisuals();
      S.dragSource = null;
      if (S.turnState === "human") renderHint();
    });

    document.addEventListener("keydown", onKeyDown);

    global.addEventListener("error", function (ev) {
      if (ev && ev.target && ev.target.tagName === "SCRIPT") {
        reportFatal("脚本加载失败", ev.target.src || "未知脚本");
        return;
      }
      var err = ev && (ev.error || ev.message);
      reportFatal("脚本异常", err || "未知异常");
    }, true);

    global.addEventListener("unhandledrejection", function (ev) {
      var reason = ev && ev.reason;
      reportFatal("未处理的 Promise 异常", reason && reason.message ? reason.message : reason || "未知");
    });
  }

  function bindSegButtons(groupEl, onPick) {
    if (!groupEl) return;
    for (var i = 0; i < groupEl.children.length; i++) {
      (function (btn) {
        if (!btn || !btn.dataset) return;
        var value = parseInt(btn.dataset.value, 10);
        if (!isFinite(value)) return;
        btn.addEventListener("click", function () { onPick(value); });
      })(groupEl.children[i]);
    }
  }

  function onKeyDown(ev) {
    if (!ev || ev.key !== "Escape") return;
    if (S.rulesOpen) { closeRules(); return; }
    if (S.turnState === "response-human" && (S.responseSource || S.dragSource)) {
      S.responseSource = null;
      S.dragSource = null;
      S.dragKind = "";
      S.fieldHint = "";
      endDragVisuals();
      clearTargetHighlights();
      clearHoverTargets();
      renderAll();
      return;
    }
    if (S.turnState === "human" &&
        (S.selectedHandIndex >= 0 || S.selectedFreeAction >= 0 || S.selectedSource ||
         S.dragSource || S.dragHandIndex >= 0)) {
      S.selectedHandIndex = -1;
      S.selectedFreeAction = -1;
      S.selectedSource = null;
      S.dragSource = null;
      S.fieldHint = "";
      endDragVisuals();
      clearTargetHighlights();
      clearHoverTargets();
      renderAll();
    }
  }

  function openRules() {
    S.rulesOpen = true;
    setHidden(S.dom.rulesModal, false);
  }

  function closeRules() {
    S.rulesOpen = false;
    setHidden(S.dom.rulesModal, true);
  }

  /* ============================================================
   * 8. 菜单交互
   * ============================================================ */
  function applyUrlToMenu(parsed) {
    S.fast = !!parsed.fast;
    S.aiDelay = parsed.fast ? 20 : 750;

    S.menu.players = parsed.players;
    S.menu.colors = parsed.colors;
    S.menu.difficulty = parsed.difficulty;
    S.menu.seed = parsed.seed;
    S.menu.colorsTouched = !!parsed.colorsTouched;
    updateMenuUI();
  }

  function updateMenuUI() {
    setSegSelected(S.dom.segPlayers, S.menu.players);
    setSegSelected(S.dom.segColors, S.menu.colors);
    setSegSelected(S.dom.segDifficulty, S.menu.difficulty);
    if (S.dom.seedInput) S.dom.seedInput.value = String(S.menu.seed);
  }

  function setSegSelected(groupEl, value) {
    if (!groupEl) return;
    for (var i = 0; i < groupEl.children.length; i++) {
      var btn = groupEl.children[i];
      if (!btn || !btn.dataset) continue;
      var v = parseInt(btn.dataset.value, 10);
      var on = v === value;
      if (on) btn.classList.add("is-selected");
      else btn.classList.remove("is-selected");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function onPlayersPicked(value) {
    S.menu.players = value;
    if (!S.menu.colorsTouched) S.menu.colors = Math.min(value, 4);
    updateMenuUI();
  }

  function onColorsPicked(value) {
    S.menu.colors = value;
    S.menu.colorsTouched = true;
    updateMenuUI();
  }

  function onDifficultyPicked(value) {
    S.menu.difficulty = value;
    updateMenuUI();
  }

  function readSeedFromInput() {
    var seed = null;
    if (S.dom.seedInput) seed = toIntOrNull(String(S.dom.seedInput.value).trim());
    if (seed === null) {
      seed = randomSeed();
      if (S.dom.seedInput) S.dom.seedInput.value = String(seed);
    }
    return seed;
  }

  function onStartGameClick() {
    var seed = readSeedFromInput();
    S.menu.seed = seed;
    var cfg = {
      player_count: S.menu.players,
      color_count: S.menu.colors,
      ai_difficulty: S.menu.difficulty,
      seed: seed,
      human_seat: 0,
      all_ai: false,
      first_seat: 0
    };
    startGame(cfg);
  }

  /* ============================================================
   * 9. 渲染：通用卡片元素
   * ============================================================ */
  function registerTarget(el, info) {
    var entry = {
      el: el,
      zone: info.zone,
      seat: info.seat,
      uid: info.cardUid,
      slot: info.slot,
      own: !!info.own
    };
    S.targetEls.push(entry);
    attachFieldTarget(entry);
  }

  function colorCardEl(card, opts) {
    opts = opts || {};
    card = card || {};
    var size = opts.size || "sm";
    var el = h("div", {
      class: "kk-card color-card size-" + size + " " + colorClass(card.color),
      title: opts.title || ("颜色牌 · " + colorName(card.color))
    });
    el.setAttribute("aria-label", "颜色牌 " + colorName(card.color));
    if (opts.zone !== undefined) el.dataset.zone = String(opts.zone);
    if (opts.seat !== undefined) el.dataset.seat = String(opts.seat);
    if (opts.cardUid !== undefined) el.dataset.cardUid = String(opts.cardUid);
    if (opts.slot !== undefined) el.dataset.slot = String(opts.slot);

    var faceChildren = [
      h("span", { class: "color-shape", "aria-hidden": "true" }, colorShape(card.color)),
      h("span", { class: "color-name" }, colorName(card.color))
    ];
    if (card.fixed) faceChildren.push(h("span", { class: "fixed-flag" }, "固定"));
    if (opts.showBack && typeof card.other_color === "number" && card.other_color >= 0) {
      faceChildren.push(h("span", { class: "card-back-hint" }, "背 " + colorName(card.other_color)));
    }
    el.appendChild(h("div", { class: "card-inner color-face" }, faceChildren));

    if (opts.register) registerTarget(el, opts);
    return el;
  }

  function identityCardEl(identity, seat, showBack, opts) {
    opts = opts || {};
    if (!identity) {
      var holder = playerName(seat);
      var empty = h("div", {
        class: "card-placeholder identity-empty" + (opts.extraClass ? " " + opts.extraClass : ""),
        title: holder + " · 身份区为空（无颜色，无法从配对成功中得分）",
        dataset: { zone: "2", seat: String(seat) },
        "aria-label": holder + " 身份区为空，无颜色"
      }, [
        h("span", { class: "identity-empty-title" }, "无身份"),
        h("span", { class: "identity-empty-sub" }, "无颜色")
      ]);
      registerTarget(empty, { zone: 2, seat: seat, cardUid: -1 });
      return empty;
    }
    var label = "身份牌（" + playerName(seat) + "）· 当前朝上：" + colorName(identity.color);
    if (showBack && typeof identity.other_color === "number" && identity.other_color >= 0) {
      label += " / 背面：" + colorName(identity.other_color);
    }
    return colorCardEl(identity, {
      size: opts.size || "sm",
      zone: 2,
      seat: seat,
      cardUid: identity.uid,
      showBack: !!showBack,
      register: true,
      title: label
    });
  }

  function actionHandCardEl(action, handIndex, selected) {
    var inactive = S.turnState !== "human";
    var el = h("button", {
      type: "button",
      class: "kk-card action-card card-hand hand-card " + actionClass(action) +
        (selected ? " is-selected" : "") + (inactive ? " is-inactive" : ""),
      title: actionName(action) + "：" + actionDesc(action),
      "aria-pressed": selected ? "true" : "false",
      dataset: { testid: "hand-card", handIndex: String(handIndex) }
    }, [
      h("span", { class: "action-band" }, [
        h("span", { class: "action-icon", "aria-hidden": "true" }, actionIcon(action)),
        h("span", { class: "action-band-name" }, actionName(action))
      ]),
      h("span", { class: "action-name" }, actionName(action)),
      h("span", { class: "action-tag" }, "行动牌")
    ]);
    el.addEventListener("click", function () { onHandCardClick(handIndex); });
    el.addEventListener("mouseenter", function () { highlightOptionTargets(handOptionsFor(handIndex), "target-hover"); });
    el.addEventListener("mouseleave", clearHoverTargets);
    el.addEventListener("focus", function () { highlightOptionTargets(handOptionsFor(handIndex), "target-hover"); });
    el.addEventListener("blur", clearHoverTargets);
    /* 人类回合：手牌可直接拖到场上高亮目标执行（点击/按钮列表路径保留） */
    if (!inactive) {
      el.draggable = true;
      el.setAttribute("draggable", "true");
      el.classList.add("is-hand-draggable");
      el.setAttribute("title", actionName(action) + "：" + actionDesc(action) + "（可拖到场上高亮目标）");
      el.addEventListener("dragstart", function (ev) { onHandDragStart(ev, handIndex, el); });
      el.addEventListener("dragend", function () { onHandDragEnd(); });
    }
    return el;
  }

  function pipsEl(filled, total) {
    var wrap = h("span", { class: "score-pips", "aria-hidden": "true" });
    for (var i = 0; i < total; i++) {
      wrap.appendChild(h("span", { class: "pip" + (i < filled ? " is-filled" : "") }));
    }
    return wrap;
  }

  function miniBacksEl(count) {
    var wrap = h("span", { class: "opp-hand-backs" });
    var shown = Math.min(count, 4);
    for (var i = 0; i < shown; i++) wrap.appendChild(h("span", { class: "mini-back" }));
    return wrap;
  }

  /* ============================================================
   * 10. 渲染：页头 / 牌桌 / 面板 / 日志 / 提示
   * ============================================================ */
  function renderAll() {
    S.targetEls = [];
    renderHeader();
    renderOpponents();
    renderTable();
    renderHumanArea();
    decorateFieldInteractions();
    renderLog();
    renderHint();
    renderModals();
  }

  function renderHeader() {
    var snap = S.snapshot;
    var P = phaseEnum();
    var roundText = "第 " + (snap ? snap.round : 1) + " 轮";
    setText(S.dom.hdrRound, roundText);
    setText(S.dom.roundBadge, roundText);

    var roundName = snap ? playerName(snap.turn_seat) : "—";
    var phase = snap ? snap.phase : P.SETUP;
    var isOver = S.turnState === "over" || (snap && (snap.game_over || phase === P.GAME_OVER));
    var phaseLabel = isOver ? "已结束" : phaseText(phase);
    setText(S.dom.hdrPhase, phaseLabel);
    setText(S.dom.phaseBadge, phaseLabel);

    if (isOver) {
      var winnerNames = [];
      var winnerSeats = snap && Array.isArray(snap.winners) ? snap.winners : [];
      for (var wi = 0; wi < winnerSeats.length; wi++) {
        var wp = playerBySeat(snap, winnerSeats[wi]);
        if (wp) winnerNames.push(wp.name);
      }
      setText(S.dom.hdrTurn, winnerNames.length ? "胜者：" + winnerNames.join("、") : "对局结束");
    } else if (snap && phase === P.RESPONSE && effectiveResponder() >= 0) {
      setText(S.dom.hdrTurn, "响应中：" + playerName(effectiveResponder()));
    } else {
      setText(S.dom.hdrTurn, "轮到 " + roundName);
    }

    /* 回合横幅 */
    var title = "准备中…";
    var sub = "";
    if (S.turnState === "human") {
      title = "轮到你了";
      sub = "点手牌或免费动作，再点场上高亮目标；也可拖拽手牌 / 自己的抽牌区 / 身份牌";
    } else if (S.turnState === "ai") {
      title = (snap ? playerName(snap.turn_seat) : "电脑") + " 思考中…";
      sub = "第 " + (snap ? snap.round : 1) + " 轮 · 行动阶段";
    } else if (S.turnState === "response-human") {
      title = "轮到你响应";
      sub = "你是响应者：点击 / 拖拽场上配牌区或身份牌执行免费动作，或点「不响应」";
    } else if (S.turnState === "response-ai") {
      title = (effectiveResponder() >= 0 ? playerName(effectiveResponder()) : "电脑") + " 正在响应…";
      sub = "配对响应窗口 · 全员按序参与";
    } else if (S.turnState === "over") {
      title = "对局结束";
      sub = "查看结算结果";
    } else if (S.turnState === "waiting") {
      title = "结算中…";
      sub = "";
    } else if (snap && snap.game_over) {
      title = "对局结束";
    }
    setBanner(title, sub);
  }

  function setBanner(title, sub) {
    var banner = S.dom.turnBanner;
    if (!banner) return;
    var t = banner.querySelector ? banner.querySelector(".banner-title") : null;
    var s = banner.querySelector ? banner.querySelector(".banner-sub") : null;
    /* 首次初始化时 banner 子节点来自静态 HTML；若被替换过则重建 */
    if (!t || !s) {
      clearNode(banner);
      t = h("div", { class: "banner-title" });
      s = h("div", { class: "banner-sub" });
      banner.appendChild(t);
      banner.appendChild(s);
    }
    setText(t, title);
    setText(s, sub);
  }

  function renderOpponents() {
    var host = S.dom.opponents;
    if (!host) return;
    clearNode(host);
    var snap = S.snapshot;
    if (!snap) return;
    for (var i = 0; i < snap.players.length; i++) {
      var p = snap.players[i];
      if (!p || p.seat === S.humanSeat) continue;
      host.appendChild(buildOpponentPanel(p, snap));
    }
  }

  function buildOpponentPanel(p, snap) {
    var responder = effectiveResponder();
    var panel = h("div", {
      class: "opponent-panel" +
        (p.is_turn ? " is-turn" : "") +
        (responder === p.seat ? " is-responder" : "") +
        (p.is_winner ? " is-winner" : ""),
      dataset: { testid: "player-panel", seat: String(p.seat) },
      "aria-label": "玩家 " + p.name
    });

    var tags = [];
    if (p.is_turn) tags.push(h("span", { class: "opp-turn-tag" }, "行动中"));
    if (responder === p.seat) tags.push(h("span", { class: "opp-resp-tag" }, "响应中"));
    if (p.is_winner) tags.push(h("span", { class: "opp-win-tag" }, "胜者"));

    panel.appendChild(h("div", { class: "opp-head" },
      [h("span", { class: "opp-name" }, p.name)].concat(tags).concat([
        h("span", { class: "opp-score" }, ["个人 ", h("b", {}, String(p.personal)), "/", String(winScore())])
      ])
    ));

    var idWrap = h("div", { class: "opp-identity" }, [
      h("span", { class: "opp-sub-label" }, "身份"),
      identityCardEl(p.identity, p.seat, false)
    ]);

    var drawWrap = h("div", { class: "opp-draw" });
    if (!p.draw || p.draw.length === 0) {
      drawWrap.appendChild(h("span", { class: "opp-sub-label" }, "抽牌区为空"));
    } else {
      for (var i = 0; i < p.draw.length; i++) {
        drawWrap.appendChild(colorCardEl(p.draw[i], {
          size: "xs",
          zone: 1,
          seat: p.seat,
          cardUid: p.draw[i].uid,
          showBack: false,
          register: true
        }));
      }
    }

    panel.appendChild(h("div", { class: "opp-body" }, [idWrap, drawWrap]));

    var colorNote = p.identity
      ? "得分色：" + colorName(p.identity.color) + (p.identity.fixed ? "（固定）" : "")
      : "无得分色";
    var handEl = h("span", { class: "opp-hand" }, [
      miniBacksEl(p.hand_count || 0),
      h("span", { class: "hand-count" }, "手牌 " + (p.hand_count || 0) + "/" + handCap())
    ]);

    panel.appendChild(h("div", { class: "opp-foot" }, [
      h("span", { class: "opp-color-note" }, colorNote),
      handEl
    ]));
    return panel;
  }

  function renderTable() {
    renderMatchZone();
    renderPiles();
  }

  function renderMatchZone() {
    var snap = S.snapshot;
    var host = S.dom.matchSlots;
    if (!host) return;
    clearNode(host);
    var cards = snap && Array.isArray(snap.match) ? snap.match : [null, null];
    for (var slot = 0; slot < 2; slot++) {
      host.appendChild(buildMatchSlot(slot, cards[slot] || null));
    }

    var statusEl = S.dom.matchStatus;
    if (!statusEl) return;
    statusEl.className = "match-status";
    var text = "";
    var P = phaseEnum();
    if (snap && snap.phase === P.RESPONSE) {
      var respSeat = effectiveResponder();
      text = "响应窗口 · 等待 " + (respSeat >= 0 ? playerName(respSeat) : "结算") + " 决定";
      statusEl.classList.add("is-response");
    } else if (S.lastMatchResult) {
      var r = S.lastMatchResult;
      if (r.success) {
        var gained = Array.isArray(r.personal_gained) ? r.personal_gained.length : 0;
        text = "配对成功 · 「" + colorName(r.color) + "」" + (gained > 0 ? "个人分 +1" : "无人得分");
        statusEl.classList.add("is-ok");
      } else if (r.invalid) {
        text = "配对无效 · 响应后不足两张牌";
        statusEl.classList.add("is-bad");
      } else {
        var sc = r.slot_colors || [];
        text = "配对失败 · 「" + colorName(sc[0]) + "」vs「" + colorName(sc[1]) + "」";
        statusEl.classList.add("is-bad");
      }
    } else if (cards[0] && cards[1]) {
      text = "两槽已满 · 可打出手牌【配对】";
    } else {
      text = "用【移动】把颜色牌放进空槽，凑出同色配对";
    }
    setText(statusEl, text);
  }

  function buildMatchSlot(slot, card) {
    var wrap = h("div", {
      class: "match-slot",
      dataset: { testid: "match-slot-" + slot, zone: "3", slot: String(slot) }
    });
    wrap.appendChild(h("span", { class: "slot-mark" }, slotMark(slot)));

    if (card) {
      wrap.appendChild(colorCardEl(card, {
        size: "lg",
        zone: 3,
        slot: slot,
        cardUid: card.uid,
        showBack: typeof card.other_color === "number" && card.other_color >= 0,
        register: false
      }));
      var ownerText = card.owner === S.humanSeat ? "你的牌" : playerName(card.owner);
      wrap.appendChild(h("span", { class: "slot-owner-tag" }, ownerText));
    } else {
      wrap.appendChild(h("div", { class: "slot-empty" }, [
        h("span", { class: "slot-empty-icon", "aria-hidden": "true" }, "＋"),
        h("span", { class: "slot-empty-text" }, "空槽")
      ]));
    }
    /* 整个槽位（含空槽）都是可点击/可放置的目标，注册在包裹层上 */
    registerTarget(wrap, { zone: 3, slot: slot, cardUid: card ? card.uid : -1 });
    return wrap;
  }

  function renderPiles() {
    var host = S.dom.piles;
    if (!host) return;
    clearNode(host);
    var g = S.game;
    if (!g) return;
    function count(arr) { return Array.isArray(arr) ? arr.length : 0; }
    host.appendChild(buildPile("颜色牌堆", count(g.color_deck), true, "pile-color-deck"));
    host.appendChild(buildPile("颜色弃牌", count(g.color_discard), true, "pile-color-discard"));
    host.appendChild(buildPile("行动牌堆", count(g.action_deck), false, "pile-action-deck"));
    host.appendChild(buildPile("行动弃牌", count(g.action_discard), false, "pile-action-discard"));
  }

  function buildPile(label, count, isColor, testid) {
    return h("div", { class: "pile", dataset: { testid: testid } }, [
      h("span", { class: "pile-icon " + (isColor ? "is-color" : "is-action"), "aria-hidden": "true" }),
      h("span", { class: "pile-label" }, label),
      h("span", { class: "pile-count" }, String(count))
    ]);
  }

  function renderHumanArea() {
    var host = S.dom.humanArea;
    if (!host) return;
    clearNode(host);
    var snap = S.snapshot;
    host.dataset.seat = String(S.humanSeat);
    host.className = "human-area" + (S.turnState === "human" ? " is-turn" : "");
    if (!snap) return;

    var me = playerBySeat(snap, S.humanSeat);
    if (!me) me = { seat: S.humanSeat, name: "你", personal: 0, hand: [], hand_count: 0, draw: [], identity: null };

    /* 名牌 */
    var plate = h("div", { class: "human-nameplate" }, [
      h("span", { class: "hp-name" }, me.name || "你"),
      h("span", { class: "hp-score" }, ["个人分 ", h("b", {}, String(me.personal || 0)), "/", String(winScore())]),
      pipsEl(me.personal || 0, winScore())
    ]);
    if (S.turnState === "human") {
      plate.appendChild(h("span", { class: "hp-turn" }, "你的回合"));
    } else if (S.turnState === "response-human") {
      plate.appendChild(h("span", { class: "hp-turn" }, "等待你响应"));
    } else if (S.turnState === "over") {
      plate.appendChild(h("span", { class: "hp-turn" }, "对局结束"));
    } else {
      var respSeat = effectiveResponder();
      var waitName = snap.phase === phaseEnum().RESPONSE && respSeat >= 0 ? playerName(respSeat) : playerName(snap.turn_seat);
      plate.appendChild(h("span", { class: "hp-hint" }, "等待 " + waitName + "…"));
    }
    host.appendChild(plate);

    /* 主行：身份 / 抽牌区 / 手牌信息（没有响应槽） */
    var identityBlock = h("div", { class: "human-slot human-identity" }, [
      h("span", { class: "slot-label" }, ["身份牌", me.identity ? " · 得分色 " + colorName(me.identity.color) : " · 无颜色"]),
      identityCardEl(me.identity, me.seat, true)
    ]);

    var drawRow = h("div", { class: "draw-row" });
    var draw = Array.isArray(me.draw) ? me.draw : [];
    for (var i = 0; i < drawCap(); i++) {
      if (i < draw.length) {
        drawRow.appendChild(colorCardEl(draw[i], {
          size: "sm",
          zone: 1,
          seat: me.seat,
          cardUid: draw[i].uid,
          showBack: true,
          register: true,
          own: true
        }));
      } else {
        drawRow.appendChild(h("div", { class: "draw-empty" }));
      }
    }
    var drawBlock = h("div", { class: "human-slot" }, [
      h("span", { class: "slot-label" }, ["抽牌区 ", h("b", {}, draw.length + "/" + drawCap())]),
      drawRow
    ]);

    var handCount = Array.isArray(me.hand) ? me.hand.length : (me.hand_count || 0);
    var metaBlock = h("div", { class: "human-hand-meta" }, [
      h("div", { class: "meta-block" }, ["手牌 ", h("b", {}, String(handCount)), "/" + handCap()]),
      h("div", { class: "meta-block" }, ["行动牌堆 ", h("b", {}, String(S.game && S.game.action_deck ? S.game.action_deck.length : 0))])
    ]);

    host.appendChild(h("div", { class: "human-main" }, [identityBlock, drawBlock, metaBlock]));

    /* 行动栏（免费动作 + 手牌行动）+ 手牌 */
    host.appendChild(buildActionBar());
    host.appendChild(buildHand());
  }

  /* ---------- 手牌 / 免费动作筛选 ---------- */
  function isHandAction(action) {
    var A = actionEnum();
    return action === A.MATCH || action === A.FIX || action === A.REMOVE;
  }

  function countFreeOptions(action) {
    var n = 0;
    for (var i = 0; i < S.freeActions.length; i++) {
      if (S.freeActions[i] && S.freeActions[i].action === action) n += 1;
    }
    return n;
  }

  function freeOptionsFor(action) {
    var out = [];
    for (var i = 0; i < S.freeActions.length; i++) {
      var o = S.freeActions[i];
      if (o && o.action === action) out.push(o);
    }
    return out;
  }

  function handOptionsFor(handIndex) {
    var out = [];
    for (var i = 0; i < S.legalActions.length; i++) {
      var o = S.legalActions[i];
      if (o && o.hand_index === handIndex && isHandAction(o.action)) out.push(o);
    }
    return out;
  }

  /* ---------- 免费动作入口（移动 / 替换 / 翻转） ---------- */
  function buildFreeActionRow(inactive) {
    var A = actionEnum();
    var row = h("div", { class: "free-action-row" });
    row.appendChild(h("span", { class: "free-action-label" }, "免费动作"));
    var acts = [A.MOVE, A.REPLACE, A.FLIP];
    for (var i = 0; i < acts.length; i++) {
      (function (action) {
        var count = countFreeOptions(action);
        var selected = S.selectedFreeAction === action;
        var disabled = count === 0 || !!inactive;
        var btn = h("button", {
          type: "button",
          class: "free-action-btn " + actionClass(action) +
            (selected ? " is-selected" : "") + (count === 0 ? " is-empty" : ""),
          disabled: disabled,
          title: actionName(action) + "：" + actionDesc(action) + (count === 0 ? "（当前没有可用目标）" : "（" + count + " 个目标）"),
          dataset: { testid: "free-action", action: String(action) },
          "aria-pressed": selected ? "true" : "false"
        }, [
          h("span", { class: "fa-icon", "aria-hidden": "true" }, actionIcon(action)),
          h("span", { class: "fa-name" }, actionName(action)),
          h("span", { class: "fa-count" }, String(count))
        ]);
        btn.addEventListener("click", function () { onFreeActionClick(action); });
        btn.addEventListener("mouseenter", function () { highlightOptionTargets(freeOptionsFor(action), "target-hover"); });
        btn.addEventListener("mouseleave", clearHoverTargets);
        btn.addEventListener("focus", function () { highlightOptionTargets(freeOptionsFor(action), "target-hover"); });
        btn.addEventListener("blur", clearHoverTargets);
        row.appendChild(btn);
      })(acts[i]);
    }
    return row;
  }

  function buildFreeActionOptionButton(option, index) {
    var btn = h("button", {
      type: "button",
      class: "action-option free-action-option " + actionClass(option.action),
      title: option.text || actionName(option.action),
      dataset: { testid: "free-action-option", optionIndex: String(index), action: String(option.action) }
    }, [
      h("span", { class: "opt-icon", "aria-hidden": "true" }, actionIcon(option.action)),
      h("span", { class: "opt-text" }, option.text || actionName(option.action))
    ]);
    btn.addEventListener("click", function () { onFreeActionOptionClick(option); });
    btn.addEventListener("mouseenter", function () { highlightTarget(option.target); });
    btn.addEventListener("mouseleave", clearTargetHighlights);
    btn.addEventListener("focus", function () { highlightTarget(option.target); });
    btn.addEventListener("blur", clearTargetHighlights);
    return btn;
  }

  function buildActionOptionButton(option, index) {
    var btn = h("button", {
      type: "button",
      class: "action-option " + actionClass(option.action),
      title: option.text || actionName(option.action),
      dataset: { testid: "action-option", optionIndex: String(index) }
    }, [
      h("span", { class: "opt-icon", "aria-hidden": "true" }, actionIcon(option.action)),
      h("span", { class: "opt-text" }, option.text || actionName(option.action))
    ]);
    btn.addEventListener("click", function () { onActionOptionClick(option); });
    btn.addEventListener("mouseenter", function () { highlightTarget(option.target); });
    btn.addEventListener("mouseleave", clearTargetHighlights);
    btn.addEventListener("focus", function () { highlightTarget(option.target); });
    btn.addEventListener("blur", clearTargetHighlights);
    return btn;
  }

  function buildActionBar() {
    var bar = h("div", { class: "action-bar" });
    var A = actionEnum();

    if (!S.snapshot) {
      bar.appendChild(h("span", { class: "action-hint" }, "加载中…"));
      return bar;
    }

    if (S.turnState !== "human") {
      var st = "";
      if (S.turnState === "ai") st = "等待 " + playerName(S.snapshot.turn_seat) + " 行动…";
      else if (S.turnState === "response-human") st = "响应窗口：可直接点击 / 拖拽场上高亮目标，或使用下方响应条";
      else if (S.turnState === "response-ai") st = "等待 " + playerName(effectiveResponder() >= 0 ? effectiveResponder() : 0) + " 响应…";
      else if (S.turnState === "over") st = "对局已结束";
      else st = "结算中…";
      bar.appendChild(h("span", { class: "action-hint" }, st));
      return bar;
    }

    var me = playerBySeat(S.snapshot, S.humanSeat);
    var handLen = me && Array.isArray(me.hand) ? me.hand.length : 0;
    if (S.selectedHandIndex >= handLen) S.selectedHandIndex = -1;

    /* 免费动作入口始终显示，即使当前没有合法手牌也能直接行动 */
    bar.appendChild(buildFreeActionRow(false));

    if (S.fieldHint) bar.appendChild(h("span", { class: "field-hint" }, S.fieldHint));

    var optionsRow = h("div", { class: "action-options-row" });

    if (S.legalActions.length === 0 && S.freeActions.length === 0) {
      bar.classList.add("is-empty");
      optionsRow.appendChild(h("span", { class: "action-hint is-warn" }, "你没有任何合法行动：跳过本回合并弃 1 张手牌。"));
      var skipBtn = h("button", { type: "button", class: "skip-turn", dataset: { testid: "skip-turn" } }, "跳过本回合");
      skipBtn.addEventListener("click", onSkipTurnClick);
      optionsRow.appendChild(skipBtn);
      bar.appendChild(optionsRow);
      return bar;
    }

    if (S.selectedFreeAction >= 0) {
      var freeOpts = freeOptionsFor(S.selectedFreeAction);
      var twoStep = S.selectedFreeAction === A.MOVE || S.selectedFreeAction === A.REPLACE;
      var freeHint;
      if (twoStep) {
        freeHint = S.selectedSource
          ? "已选来源：点击高亮的落点执行；点其他来源可更换，Esc 取消"
          : "点击场上高亮的来源牌（自己的抽牌区 / 任意身份牌），再点落点；也可直接拖拽，或从下方列表选择";
      } else {
        freeHint = "点击场上高亮的非固定颜色牌直接翻转；也可直接拖拽，或从下方列表选择";
      }
      optionsRow.appendChild(h("span", { class: "action-hint" }, freeHint));
      if (freeOpts.length === 0) {
        optionsRow.appendChild(h("span", { class: "action-hint is-warn" }, "该免费动作当前没有可用目标，换一个动作试试。"));
      } else {
        for (var fi = 0; fi < freeOpts.length; fi++) optionsRow.appendChild(buildFreeActionOptionButton(freeOpts[fi], fi));
      }
    } else if (S.selectedHandIndex >= 0) {
      var handOpts = handOptionsFor(S.selectedHandIndex);
      if (handOpts.length === 0) {
        optionsRow.appendChild(h("span", { class: "action-hint is-warn" }, "这张手牌当前没有合法目标；换一张手牌，或直接使用上方免费动作。"));
      } else {
        var handHint = handOpts[0].action === A.MATCH
          ? "点击配牌区槽位（或下方按钮）打出配对；也可直接把这张配对牌拖到配牌槽"
          : "点击场上高亮的目标牌执行，或从下方按钮选择；也可直接拖拽这张手牌到高亮目标（Esc 取消）";
        optionsRow.appendChild(h("span", { class: "action-hint" }, handHint));
        for (var hi = 0; hi < handOpts.length; hi++) optionsRow.appendChild(buildActionOptionButton(handOpts[hi], hi));
      }
    } else if (S.legalActions.length === 0) {
      optionsRow.appendChild(h("span", { class: "action-hint" }, "没有可打出的手牌行动；请直接使用上方免费动作，或拖拽场上牌。"));
    } else {
      optionsRow.appendChild(h("span", { class: "action-hint" },
        "点击手牌打出行动，或选择免费动作；选好后可点场上目标；手牌 / 自己的抽牌区 / 身份牌都可拖到高亮目标。"));
    }

    bar.appendChild(optionsRow);
    return bar;
  }

  function buildHand() {
    var handWrap = h("div", { class: "hand-wrap" });
    var handEl = h("div", { class: "hand", dataset: { testid: "hand" } });
    var me = S.snapshot ? playerBySeat(S.snapshot, S.humanSeat) : null;
    var hand = me && Array.isArray(me.hand) ? me.hand : [];
    /* 新规则手牌只有配对 / 固定 / 移除；防御性过滤掉旧版本可能残留的其他行动牌 */
    var shown = 0;
    for (var i = 0; i < hand.length; i++) {
      if (!isHandAction(hand[i])) continue;
      handEl.appendChild(actionHandCardEl(hand[i], i, S.selectedHandIndex === i));
      shown += 1;
    }
    if (shown === 0) handEl.appendChild(h("span", { class: "hand-empty" }, "手牌为空"));
    handWrap.appendChild(handEl);
    return handWrap;
  }

  /* ---------- 目标高亮（支持 zone=1/2/3 与嵌套 target 结构） ---------- */
  function clearTargetHighlights() {
    for (var i = 0; i < S.targetEls.length; i++) {
      if (S.targetEls[i] && S.targetEls[i].el) S.targetEls[i].el.classList.remove("target-highlight");
    }
  }

  /** 递归收集 target 中表示「目标位置」的描述（zone/seat/card_uid/slot）。 */
  function targetDescriptors(target) {
    var out = [];
    function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 3) return;
      if (Array.isArray(node)) {
        for (var ai = 0; ai < node.length; ai++) walk(node[ai], depth + 1);
        return;
      }
      var hasZone = Object.prototype.hasOwnProperty.call(node, "zone");
      var hasSeat = Object.prototype.hasOwnProperty.call(node, "seat");
      var hasSlot = Object.prototype.hasOwnProperty.call(node, "slot");
      var hasUid = Object.prototype.hasOwnProperty.call(node, "card_uid") ||
        Object.prototype.hasOwnProperty.call(node, "uid");
      if (hasZone || hasSeat || hasSlot || hasUid) {
        out.push({
          zone: hasZone ? node.zone : undefined,
          seat: hasSeat ? node.seat : undefined,
          slot: hasSlot ? node.slot : undefined,
          uid: Object.prototype.hasOwnProperty.call(node, "card_uid") ? node.card_uid : node.uid
        });
      }
      /* 新引擎的 MOVE / REPLACE 目标带 to_zone / to_seat（同层扁平字段）：同时高亮终点 */
      if (Object.prototype.hasOwnProperty.call(node, "to_zone") || Object.prototype.hasOwnProperty.call(node, "to_seat")) {
        out.push({
          zone: node.to_zone,
          seat: node.to_seat,
          slot: hasSlot ? node.slot : undefined
        });
      }
      for (var key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        if (typeof node[key] === "object" && node[key] !== null) walk(node[key], depth + 1);
      }
    }
    walk(target, 0);
    return out;
  }

  function descriptorHitsTarget(d, t) {
    if (!t) return false;
    var zone = d.zone;
    if (zone === 2) {
      return t.zone === 2 && (d.seat === undefined || t.seat === d.seat);
    }
    if (zone === 1) {
      return t.zone === 1 && (d.seat === undefined || t.seat === d.seat) && (d.uid === undefined || t.uid === d.uid);
    }
    if (zone === 3) {
      return t.zone === 3 && (d.slot === undefined || t.slot === d.slot);
    }
    if (zone === 0 || zone === 4) return false;
    /* 无 zone 的旧式 / 简写 target */
    if (d.uid !== undefined && t.uid !== undefined && t.uid === d.uid) return true;
    if (d.slot !== undefined && d.slot >= 0 && t.zone === 3 && t.slot === d.slot) return true;
    if (d.seat !== undefined && t.zone === 2 && t.seat === d.seat) return true;
    return false;
  }

  function highlightTarget(target) {
    clearTargetHighlights();
    if (!target || typeof target !== "object") return;
    var descriptors = targetDescriptors(target);
    if (descriptors.length === 0) return;
    for (var i = 0; i < S.targetEls.length; i++) {
      var t = S.targetEls[i];
      if (!t || !t.el) continue;
      for (var d = 0; d < descriptors.length; d++) {
        if (descriptorHitsTarget(descriptors[d], t)) {
          t.el.classList.add("target-highlight");
          break;
        }
      }
    }
  }

  /* ============================================================
   * 9.5 场上直接操作：悬停高亮 / 点击目标 / 拖拽
   * 说明：这些都是下方按钮列表的「增强路径」，按钮列表与键盘点击始终保留。
   * ============================================================ */
  var FIELD_CLASSES = [
    "target-hover", "target-source", "target-dest", "is-field-selected",
    "is-draggable", "is-drop-target", "is-dragover", "is-dragging"
  ];

  function clearFieldHint() { S.fieldHint = ""; }

  /** 即时提示：写入 fieldHint 并刷新界面（不改变引擎状态）。 */
  function showFieldHint(text) {
    S.fieldHint = text || "";
    if (S.turnState === "human" && !S.busy) renderAll();
    else renderHint();
  }

  /** 只更新底部状态提示文本（拖拽期间不重建 DOM，避免拖动中的元素被替换）。 */
  function setHintStateText(text) {
    if (S.dom.hintState) setText(S.dom.hintState, text);
  }

  function isSourceAction(action) {
    var A = actionEnum();
    return action === A.MOVE || action === A.REPLACE;
  }

  /** MOVE / REPLACE 的目标里，来源位置 {zone,seat,uid}；其他行动返回 null。 */
  function optionSourceDesc(target) {
    if (!target || typeof target !== "object") return null;
    if (!Object.prototype.hasOwnProperty.call(target, "to_zone") &&
        !Object.prototype.hasOwnProperty.call(target, "to_seat")) return null;
    return { zone: target.zone, seat: target.seat, uid: target.card_uid };
  }

  /** MOVE / REPLACE 的目标里，落点位置 {zone,seat,slot}；其他行动返回单目标本身。 */
  function optionDestDesc(target) {
    if (!target || typeof target !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(target, "to_zone") ||
        Object.prototype.hasOwnProperty.call(target, "to_seat")) {
      return { zone: target.to_zone, seat: target.to_seat, slot: target.slot };
    }
    return { zone: target.zone, seat: target.seat, slot: target.slot, uid: target.card_uid };
  }

  function entryMatchesSource(entry, src) {
    if (!entry || !src) return false;
    if (src.zone === 2) {
      if (entry.zone !== 2 || entry.seat !== src.seat) return false;
      var idUid = typeof src.uid === "number" ? src.uid : -1;
      return idUid < 0 ? true : entry.uid === idUid;
    }
    if (src.zone === 1) return entry.zone === 1 && entry.seat === src.seat && entry.uid === src.uid;
    return false;
  }

  function entryMatchesDest(entry, dest) {
    if (!entry || !dest) return false;
    if (dest.zone === 2) return entry.zone === 2 && (dest.seat === undefined || entry.seat === dest.seat);
    if (dest.zone === 3) return entry.zone === 3 && (dest.slot === undefined || entry.slot === dest.slot);
    if (dest.zone === 1) return entry.zone === 1 && entry.seat === dest.seat && entry.uid === dest.uid;
    return false;
  }

  function entryMatchesSingle(entry, target) {
    if (!entry || !target || typeof target !== "object") return false;
    if (target.zone === 2) return entry.zone === 2 && entry.seat === target.seat;
    if (target.zone === 1) return entry.zone === 1 && entry.seat === target.seat && entry.uid === target.card_uid;
    if (target.zone === 3) return entry.zone === 3 && entry.slot === target.slot;
    return false;
  }

  function sameSource(a, b) {
    if (!a || !b) return false;
    return a.zone === b.zone && a.seat === b.seat && a.uid === b.uid;
  }

  /** 某张场上牌能否作为 MOVE/REPLACE 的来源；返回 {source} 或 null。 */
  function findFreeSourceInfo(entry) {
    for (var i = 0; i < S.freeActions.length; i++) {
      var opt = S.freeActions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      var src = optionSourceDesc(opt.target);
      if (entryMatchesSource(entry, src)) return { source: src, action: opt.action };
    }
    return null;
  }

  /** 已选来源对应的所有可选目标（MOVE/REPLACE）。 */
  function optionsForSelectedSource() {
    var out = [];
    if (!S.selectedSource) return out;
    for (var i = 0; i < S.freeActions.length; i++) {
      var opt = S.freeActions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      if (sameSource(optionSourceDesc(opt.target), S.selectedSource)) out.push(opt);
    }
    return out;
  }

  /** 手牌拖拽时，entry 能匹配到的合法手牌选项。 */
  function findDropHandOption(entry) {
    if (S.dragHandIndex < 0 || !entry) return null;
    var A = actionEnum();
    var opts = handOptionsFor(S.dragHandIndex);
    for (var i = 0; i < opts.length; i++) {
      var opt = opts[i];
      if (!opt) continue;
      if (opt.action === A.MATCH) {
        /* 配对 target={}：整个配牌区（两个槽）都是落点 */
        if (entry.zone === 3) return opt;
        continue;
      }
      if (entryMatchesSingle(entry, opt.target)) return opt;
    }
    return null;
  }

  /** 拖拽中的来源/手牌放到 entry 上能匹配到的动作选项。 */
  function findDropOption(entry) {
    if (S.dragKind === "hand" || S.dragHandIndex >= 0) return findDropHandOption(entry);
    if (S.dragKind === "response") return findResponseDropOption(entry);
    if (!S.dragSource || !entry) return null;
    for (var i = 0; i < S.freeActions.length; i++) {
      var opt = S.freeActions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      if (!sameSource(optionSourceDesc(opt.target), S.dragSource)) continue;
      if (entryMatchesDest(entry, optionDestDesc(opt.target))) return opt;
    }
    return null;
  }

  function findFreeSingleOption(entry, action) {
    var opts = freeOptionsFor(action);
    for (var i = 0; i < opts.length; i++) {
      if (entryMatchesSingle(entry, opts[i].target)) return opts[i];
    }
    return null;
  }

  /* ---------- 响应窗口：场上点击 / 拖拽辅助（目标限 get_response_options） ---------- */
  function responseOptionsForSource(src) {
    var out = [];
    if (!src) return out;
    for (var i = 0; i < S.responseOptions.length; i++) {
      var opt = S.responseOptions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      if (sameSource(optionSourceDesc(opt.target), src)) out.push(opt);
    }
    return out;
  }

  /** entry 能否作为某个响应 MOVE/REPLACE 的来源。 */
  function findResponseSourceInfo(entry) {
    for (var i = 0; i < S.responseOptions.length; i++) {
      var opt = S.responseOptions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      var src = optionSourceDesc(opt.target);
      if (entryMatchesSource(entry, src)) return { source: src, action: opt.action };
    }
    return null;
  }

  /** entry 匹配到的单目标响应选项（用于翻转直接点击）。 */
  function findResponseSingleOption(entry, action) {
    for (var i = 0; i < S.responseOptions.length; i++) {
      var opt = S.responseOptions[i];
      if (!opt) continue;
      if (action !== undefined && opt.action !== action) continue;
      if (entryMatchesSingle(entry, opt.target)) return opt;
    }
    return null;
  }

  /** 响应拖拽中的来源放到 entry 上能匹配到的响应选项。 */
  function findResponseDropOption(entry) {
    if (!S.dragSource || !entry) return null;
    for (var i = 0; i < S.responseOptions.length; i++) {
      var opt = S.responseOptions[i];
      if (!opt || !isSourceAction(opt.action)) continue;
      if (!sameSource(optionSourceDesc(opt.target), S.dragSource)) continue;
      if (entryMatchesDest(entry, optionDestDesc(opt.target))) return opt;
    }
    return null;
  }

  function markResponseDropTargets() {
    for (var i = 0; i < S.targetEls.length; i++) {
      if (findResponseDropOption(S.targetEls[i])) S.targetEls[i].el.classList.add("is-drop-target");
    }
  }

  /** 悬停响应来源时，高亮该来源可执行的响应落点。 */
  function highlightResponseDestsForSource(src) {
    clearHoverTargets();
    var opts = responseOptionsForSource(src);
    for (var i = 0; i < opts.length; i++) {
      var dest = optionDestDesc(opts[i].target);
      if (!dest) continue;
      for (var j = 0; j < S.targetEls.length; j++) {
        if (entryMatchesDest(S.targetEls[j], dest)) S.targetEls[j].el.classList.add("target-hover");
      }
    }
  }

  /** 响应模式下的渲染期装饰：可拖来源 / 可翻转牌 / 已选来源的落点。 */
  function decorateResponseInteractions() {
    var A = actionEnum();
    var i, j;
    for (i = 0; i < S.targetEls.length; i++) {
      var entry = S.targetEls[i];
      var info = findResponseSourceInfo(entry);
      if (!info) continue;
      entry.el.classList.add("target-source");
      entry.el.classList.add("is-draggable");
      entry.el.draggable = true;
      if (typeof entry.el.setAttribute === "function") entry.el.setAttribute("draggable", "true");
      if (S.responseSource && sameSource(info.source, S.responseSource)) entry.el.classList.add("is-field-selected");
    }
    /* 翻转：场上的非固定身份/配牌牌可直接点击 */
    for (i = 0; i < S.responseOptions.length; i++) {
      var opt = S.responseOptions[i];
      if (!opt || opt.action !== A.FLIP) continue;
      markEntriesAsSingle(opt.target);
    }
    /* 已选响应来源 → 高亮其落点 */
    if (S.responseSource) {
      var destOpts = responseOptionsForSource(S.responseSource);
      for (i = 0; i < destOpts.length; i++) markEntriesAsDest(optionDestDesc(destOpts[i].target));
    }
    /* 响应拖拽中 → 高亮合法落点 */
    if (S.dragSource && S.dragKind === "response") {
      for (i = 0; i < S.targetEls.length; i++) {
        if (findResponseDropOption(S.targetEls[i])) S.targetEls[i].el.classList.add("is-drop-target");
      }
    }
  }

  /* ---------- 悬停高亮：某动作 / 某手牌的全部合法目标 ---------- */
  function clearHoverTargets() {
    for (var i = 0; i < S.targetEls.length; i++) {
      if (S.targetEls[i] && S.targetEls[i].el) S.targetEls[i].el.classList.remove("target-hover");
    }
  }

  function highlightOptionTargets(options, cls) {
    clearHoverTargets();
    if (S.turnState !== "human" || !options || options.length === 0) return;
    var className = cls || "target-hover";
    for (var i = 0; i < options.length; i++) {
      var descs = targetDescriptors(options[i].target);
      for (var d = 0; d < descs.length; d++) {
        for (var j = 0; j < S.targetEls.length; j++) {
          if (descriptorHitsTarget(descs[d], S.targetEls[j])) S.targetEls[j].el.classList.add(className);
        }
      }
    }
  }

  /* ---------- 渲染期装饰：可拖拽来源 / 可选来源 / 合法落点 ---------- */
  function clearFieldDecorations() {
    for (var i = 0; i < S.targetEls.length; i++) {
      var el = S.targetEls[i].el;
      if (!el || !el.classList) continue;
      for (var c = 0; c < FIELD_CLASSES.length; c++) el.classList.remove(FIELD_CLASSES[c]);
      if (el.draggable) el.draggable = false;
      if (typeof el.removeAttribute === "function") el.removeAttribute("draggable");
    }
    var body = document.body;
    if (body && body.classList) body.classList.remove("is-dragging");
    S.dragTargetEl = null;
  }

  function markEntriesAsDest(dest) {
    if (!dest) return;
    for (var i = 0; i < S.targetEls.length; i++) {
      if (entryMatchesDest(S.targetEls[i], dest)) S.targetEls[i].el.classList.add("target-dest");
    }
  }

  function markEntriesAsSingle(target) {
    if (!target) return;
    for (var i = 0; i < S.targetEls.length; i++) {
      if (entryMatchesSingle(S.targetEls[i], target)) S.targetEls[i].el.classList.add("target-dest");
    }
  }

  function decorateFieldInteractions() {
    clearFieldDecorations();
    if (S.busy) {
      S.dragSource = null;
      S.dragKind = "";
      S.dragHandIndex = -1;
      return;
    }
    if (S.turnState === "response-human") {
      S.dragSource = null;
      S.dragKind = "";
      S.dragHandIndex = -1;
      decorateResponseInteractions();
      return;
    }
    if (S.turnState !== "human") {
      S.dragSource = null;
      S.dragKind = "";
      S.dragHandIndex = -1;
      S.responseSource = null;
      return;
    }
    var A = actionEnum();
    var i, j;

    /* 1) 拖拽来源：MOVE/REPLACE 的 source（自己的抽牌区 / 任意身份牌） */
    var draggableSources = [];
    for (i = 0; i < S.freeActions.length; i++) {
      var fo = S.freeActions[i];
      if (!fo || !isSourceAction(fo.action)) continue;
      var src = optionSourceDesc(fo.target);
      if (src) draggableSources.push(src);
    }
    for (i = 0; i < S.targetEls.length; i++) {
      var entry = S.targetEls[i];
      for (j = 0; j < draggableSources.length; j++) {
        if (!entryMatchesSource(entry, draggableSources[j])) continue;
        entry.el.classList.add("is-draggable");
        entry.el.draggable = true;
        entry.el.setAttribute("draggable", "true");
        break;
      }
    }

    /* 2) 当前选择对应的场上次级目标 */
    if (S.selectedFreeAction === A.MOVE || S.selectedFreeAction === A.REPLACE) {
      var opts = freeOptionsFor(S.selectedFreeAction);
      for (i = 0; i < opts.length; i++) {
        var s = optionSourceDesc(opts[i].target);
        if (!s) continue;
        for (j = 0; j < S.targetEls.length; j++) {
          var e2 = S.targetEls[j];
          if (!entryMatchesSource(e2, s)) continue;
          e2.el.classList.add("target-source");
          if (S.selectedSource && sameSource(s, S.selectedSource)) e2.el.classList.add("is-field-selected");
        }
      }
      if (S.selectedSource) {
        var destOpts = optionsForSelectedSource();
        for (i = 0; i < destOpts.length; i++) markEntriesAsDest(optionDestDesc(destOpts[i].target));
      }
    } else if (S.selectedFreeAction === A.FLIP) {
      var flipOpts = freeOptionsFor(A.FLIP);
      for (i = 0; i < flipOpts.length; i++) markEntriesAsDest(optionDestDesc(flipOpts[i].target));
    } else if (S.selectedHandIndex >= 0) {
      var hopts = handOptionsFor(S.selectedHandIndex);
      if (hopts.length > 0) {
        if (hopts[0].action === A.MATCH) markEntriesAsDest({ zone: 3 });
        else for (i = 0; i < hopts.length; i++) markEntriesAsSingle(hopts[i].target);
      }
    }

    /* 3) 拖拽进行中：高亮合法落点 */
    if (S.dragSource) {
      for (i = 0; i < S.targetEls.length; i++) {
        if (findDropOption(S.targetEls[i])) S.targetEls[i].el.classList.add("is-drop-target");
      }
    }
  }

  /* ---------- 场上点击执行 ---------- */
  function onFieldTargetClick(entry) {
    if (S.turnState === "response-human" && !S.busy) {
      onResponseFieldClick(entry);
      return;
    }
    if (S.turnState !== "human" || S.busy) return;
    var A = actionEnum();

    if (S.selectedFreeAction === A.MOVE || S.selectedFreeAction === A.REPLACE) {
      handleFreeTwoStepClick(entry);
      return;
    }
    if (S.selectedFreeAction === A.FLIP) {
      var flipOpt = findFreeSingleOption(entry, A.FLIP);
      if (flipOpt) { onFreeActionOptionClick(flipOpt); return; }
      showFieldHint("这张牌不能翻转（可能是固定牌，或不是合法的翻转目标）。");
      return;
    }
    if (S.selectedHandIndex >= 0) {
      var hopts = handOptionsFor(S.selectedHandIndex);
      if (hopts.length === 0) { showFieldHint("这张手牌当前没有合法目标。"); return; }
      if (hopts[0].action === A.MATCH) {
        if (entry.zone === 3) onActionOptionClick(hopts[0]);
        else showFieldHint("请点击配牌区的槽位打出【配对】。");
        return;
      }
      for (var i = 0; i < hopts.length; i++) {
        if (entryMatchesSingle(entry, hopts[i].target)) { onActionOptionClick(hopts[i]); return; }
      }
      showFieldHint("这不是该手牌可用的目标。");
      return;
    }
    /* 未选动作时，直接点击可作来源的牌：自动选中对应动作并高亮落点（固定牌也可作为主动来源） */
    var autoAction = -1;
    var autoSource = null;
    for (var ai = 0; ai < S.freeActions.length; ai++) {
      var ao = S.freeActions[ai];
      if (!ao || !isSourceAction(ao.action)) continue;
      var asrc = optionSourceDesc(ao.target);
      if (!entryMatchesSource(entry, asrc)) continue;
      if (autoSource === null || ao.action === A.MOVE) {
        autoAction = ao.action;
        autoSource = asrc;
      }
    }
    if (autoSource) {
      S.selectedFreeAction = autoAction;
      S.selectedSource = autoSource;
      S.fieldHint = "已选中" + actionName(autoAction) + "来源，点击高亮的落点执行；也可以直接拖拽。";
      renderAll();
      return;
    }
    showFieldHint("这张牌当前没有可用的移动/替换目标（例如配牌区没有空槽），或它不能被操作。先选择手牌/动作再点场上目标，也可以拖拽自己的抽牌区 / 身份牌。");
  }

  /** 响应窗口：在牌桌上的点击（翻转直点 / 选来源 → 点落点）。 */
  function onResponseFieldClick(entry) {
    if (S.turnState !== "response-human" || S.busy) return;
    var A = actionEnum();
    /* 1) 已选来源：优先解析落点 */
    if (S.responseSource) {
      var destOpts = responseOptionsForSource(S.responseSource);
      for (var i = 0; i < destOpts.length; i++) {
        if (entryMatchesDest(entry, optionDestDesc(destOpts[i].target))) {
          onResponseOptionClick(destOpts[i]);
          return;
        }
      }
    }
    /* 2) 翻转：直接点场上非固定身份/配牌牌 */
    var flipOpt = findResponseSingleOption(entry, A.FLIP);
    if (flipOpt) { onResponseOptionClick(flipOpt); return; }
    /* 3) 点来源 → 选中/更换来源 */
    var srcInfo = findResponseSourceInfo(entry);
    if (srcInfo) {
      S.responseSource = srcInfo.source;
      S.fieldHint = "";
      renderAll();
      return;
    }
    /* 4) 其它：给出提示 */
    if (!S.responseSource) {
      for (var k = 0; k < S.responseOptions.length; k++) {
        var o = S.responseOptions[k];
        if (!o || !isSourceAction(o.action)) continue;
        if (entryMatchesDest(entry, optionDestDesc(o.target))) {
          showFieldHint("请先点击高亮的来源牌（自己抽牌区 / 任意身份牌），再点这里执行响应；也可以直接拖拽。");
          return;
        }
      }
      showFieldHint("这不是当前可响应的目标；可点击高亮的翻转牌 / 拖动来源牌，或点「不响应」。");
      return;
    }
    showFieldHint("这里不是该来源可用的响应落点。");
  }

  function handleFreeTwoStepClick(entry) {    var action = S.selectedFreeAction;
    var opts = freeOptionsFor(action);
    if (opts.length === 0) { showFieldHint("当前没有可用的「" + actionName(action) + "」目标。"); return; }

    /* 已选来源：优先执行落点 */
    if (S.selectedSource) {
      var destOpts = optionsForSelectedSource();
      for (var i = 0; i < destOpts.length; i++) {
        if (entryMatchesDest(entry, optionDestDesc(destOpts[i].target))) {
          onFreeActionOptionClick(destOpts[i]);
          return;
        }
      }
    }

    /* 点到合法来源 → 选中 / 更换来源 */
    for (var j = 0; j < opts.length; j++) {
      if (entryMatchesSource(entry, optionSourceDesc(opts[j].target))) {
        S.selectedSource = optionSourceDesc(opts[j].target);
        S.fieldHint = "";
        renderAll();
        return;
      }
    }

    if (!S.selectedSource) {
      for (var k = 0; k < opts.length; k++) {
        if (entryMatchesDest(entry, optionDestDesc(opts[k].target))) {
          showFieldHint("请先点击一张来源牌（自己抽牌区 / 任意身份牌），再点这里。");
          return;
        }
      }
      showFieldHint("请点击高亮的来源牌。");
      return;
    }
    showFieldHint("这里不是「" + actionName(action) + "」的合法落点。");
  }

  /* ---------- 拖拽（免费动作 + 手牌） ---------- */
  function endDragVisuals() {
    for (var i = 0; i < S.targetEls.length; i++) {
      var el = S.targetEls[i].el;
      if (!el || !el.classList) continue;
      el.classList.remove("is-drop-target");
      el.classList.remove("is-dragover");
      el.classList.remove("is-dragging");
    }
    if (S.dragHandEl && S.dragHandEl.classList) S.dragHandEl.classList.remove("is-dragging");
    var body = document.body;
    if (body && body.classList) body.classList.remove("is-dragging");
    S.dragTargetEl = null;
    S.dragHandEl = null;
    S.dragHandIndex = -1;
    S.dragKind = "";
  }

  function onFieldDragStart(ev, entry) {
    if (S.turnState === "response-human" && !S.busy) {
      onResponseDragStart(ev, entry);
      return;
    }
    if (S.turnState !== "human" || S.busy) {
      if (ev && ev.preventDefault) ev.preventDefault();
      return;
    }
    var info = findFreeSourceInfo(entry);
    if (!info) {
      if (ev && ev.preventDefault) ev.preventDefault();
      return;
    }
    endDragVisuals();
    S.dragKind = "free";
    S.dragSource = info.source;
    S.fieldHint = "";
    if (ev && ev.dataTransfer) {
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "kk-free-action");
      } catch (err) { /* 某些环境受限，忽略 */ }
    }
    for (var i = 0; i < S.targetEls.length; i++) {
      if (findDropOption(S.targetEls[i])) S.targetEls[i].el.classList.add("is-drop-target");
    }
    entry.el.classList.add("is-dragging");
    if (document.body && document.body.classList) document.body.classList.add("is-dragging");
    setHintStateText("拖拽中 · 拖到高亮落点松手执行（Esc / 空白处松手取消）");
  }

  function onFieldDragOver(ev, entry) {
    if (!S.dragSource && S.dragHandIndex < 0) return;
    var dropOption = findDropOption(entry);
    if (!dropOption) return; /* 非法落点：不 preventDefault，不高亮 */
    if (ev && ev.preventDefault) ev.preventDefault();
    if (ev && ev.dataTransfer) {
      try { ev.dataTransfer.dropEffect = "move"; } catch (err) { /* ignore */ }
    }
    if (S.dragTargetEl && S.dragTargetEl !== entry.el) S.dragTargetEl.classList.remove("is-dragover");
    entry.el.classList.add("is-dragover");
    S.dragTargetEl = entry.el;
    setHintStateText("松手执行：" + (dropOption.text || actionName(dropOption.action)));
  }

  function onFieldDragLeave(ev, entry) {
    if (!entry || !entry.el) return;
    entry.el.classList.remove("is-dragover");
    if (S.dragTargetEl === entry.el) S.dragTargetEl = null;
  }

  function onFieldDrop(ev, entry) {
    var isHand = S.dragKind === "hand" || S.dragHandIndex >= 0;
    var isResponse = S.dragKind === "response";
    var opt = findDropOption(entry);
    if (!opt) {
      endDragVisuals();
      S.dragSource = null;
      showFieldHint(isHand
        ? "这张手牌不能放到这里；请拖到高亮的目标上。"
        : isResponse
          ? "这里不能作为响应落点；请拖到高亮的配牌槽 / 身份区。"
          : "这张牌不能放到这里；请拖到高亮的落点。");
      return;
    }
    if (ev && ev.preventDefault) ev.preventDefault();
    endDragVisuals();
    S.dragSource = null;
    if (isHand) onActionOptionClick(opt);
    else if (isResponse) onResponseOptionClick(opt);
    else onFreeActionOptionClick(opt);
  }

  function onFieldDragEnd() {
    endDragVisuals();
    S.dragSource = null;
    if (S.turnState === "human" || S.turnState === "response-human") renderHint();
  }

  /* ---------- 手牌拖拽（配对 / 固定 / 移除） ---------- */
  function markHandDragTargets() {
    for (var i = 0; i < S.targetEls.length; i++) {
      if (findDropHandOption(S.targetEls[i])) S.targetEls[i].el.classList.add("is-drop-target");
    }
  }

  function onHandDragStart(ev, handIndex, cardEl) {
    if (S.turnState !== "human" || S.busy) {
      if (ev && ev.preventDefault) ev.preventDefault();
      return;
    }
    var opts = handOptionsFor(handIndex);
    if (opts.length === 0) {
      if (ev && ev.preventDefault) ev.preventDefault();
      showFieldHint("这张手牌当前没有合法目标，无法拖拽执行。");
      return;
    }
    var A = actionEnum();
    endDragVisuals();
    S.dragKind = "hand";
    S.dragHandIndex = handIndex;
    S.dragHandEl = cardEl;
    S.dragSource = null;
    S.fieldHint = "";
    if (ev && ev.dataTransfer) {
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "kk-hand-action");
      } catch (err) { /* ignore */ }
    }
    markHandDragTargets();
    if (cardEl && cardEl.classList) cardEl.classList.add("is-dragging");
    if (document.body && document.body.classList) document.body.classList.add("is-dragging");
    var first = opts[0];
    var hintText = first.action === A.MATCH
      ? "拖到手牌目标：拖到配牌区任一槽松手打出【配对】"
      : "拖拽手牌 · 拖到高亮目标松手执行【" + actionName(first.action) + "】（手牌 -1；Esc / 空白处取消）";
    setHintStateText(hintText);
  }

  function onHandDragEnd() {
    endDragVisuals();
    S.dragSource = null;
    if (S.turnState === "human") renderHint();
  }

  /* ---------- 响应窗口拖拽（移动 / 替换来源 → 配牌槽 / 身份区） ---------- */
  function onResponseDragStart(ev, entry) {
    if (S.turnState !== "response-human" || S.busy) {
      if (ev && ev.preventDefault) ev.preventDefault();
      return;
    }
    var info = findResponseSourceInfo(entry);
    if (!info) {
      if (ev && ev.preventDefault) ev.preventDefault();
      return;
    }
    endDragVisuals();
    S.dragKind = "response";
    S.dragSource = info.source;
    S.responseSource = null;
    S.fieldHint = "";
    if (ev && ev.dataTransfer) {
      try {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", "kk-response");
      } catch (err) { /* ignore */ }
    }
    markResponseDropTargets();
    entry.el.classList.add("is-dragging");
    if (document.body && document.body.classList) document.body.classList.add("is-dragging");
    setHintStateText("响应拖拽 · 拖到高亮的配牌槽 / 身份区松手执行响应动作（Esc 取消）");
  }

  /** 给一个场上目标元素挂上点击 / 拖拽监听（每个元素只挂一次）。 */
  function attachFieldTarget(entry) {
    var el = entry.el;
    if (!el || !el.addEventListener || el.__kkFieldAttached) return;
    el.__kkFieldAttached = true;
    el.addEventListener("click", function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      onFieldTargetClick(entry);
    });
    el.addEventListener("dragstart", function (ev) { onFieldDragStart(ev, entry); });
    el.addEventListener("dragend", function () { onFieldDragEnd(); });
    el.addEventListener("dragover", function (ev) { onFieldDragOver(ev, entry); });
    el.addEventListener("dragleave", function (ev) { onFieldDragLeave(ev, entry); });
    el.addEventListener("drop", function (ev) { onFieldDrop(ev, entry); });
    /* 响应窗口：悬停可作来源的牌时，高亮它的合法落点 */
    el.addEventListener("mouseenter", function () {
      if (S.turnState !== "response-human" || S.busy) return;
      var info = findResponseSourceInfo(entry);
      if (info) highlightResponseDestsForSource(info.source);
    });
    el.addEventListener("mouseleave", function () {
      if (S.turnState === "response-human") clearHoverTargets();
    });
  }

  /* ---------- 日志 / 提示 ---------- */
  function renderLog() {
    var host = S.dom.log;
    if (!host) return;
    clearNode(host);
    var snap = S.snapshot;
    var lines = snap && Array.isArray(snap.log) ? snap.log : [];
    setText(S.dom.logCount, String(lines.length));
    if (lines.length === 0) {
      host.appendChild(h("div", { class: "log-line" }, "对局开始后，这里会实时记录每一步。"));
      return;
    }
    for (var i = 0; i < lines.length; i++) {
      host.appendChild(h("div", { class: "log-line " + logLineClass(lines[i]) }, String(lines[i])));
    }
    host.scrollTop = host.scrollHeight;
  }

  function logLineClass(line) {
    var text = String(line || "");
    if (text.indexOf("—— 第") === 0) return "log-round";
    if (text.indexOf("对局结束") >= 0) return "log-end";
    if (text.indexOf("配对成功") >= 0) return "log-ok";
    if (text.indexOf("配对失败") >= 0 || text.indexOf("配对无效") >= 0) return "log-bad";
    if (text.indexOf("响应") >= 0) return "log-response";
    if (text.indexOf("打出") >= 0) return "log-play";
    return "";
  }

  function renderHint() {
    setText(S.dom.hintEvent, S.lastEvent || "对局开始");
    var snap = S.snapshot;
    var stateText = "";
    if (S.screen === "game" && snap) {
      var roundText = "第 " + snap.round + " 轮";
      if (S.turnState === "human") {
        var pickText = "";
        if (S.selectedFreeAction >= 0) {
          pickText = " · 已选免费动作【" + actionName(S.selectedFreeAction) + "】";
          if (isSourceAction(S.selectedFreeAction) && S.selectedSource) pickText += "（已选来源）";
        } else if (S.selectedHandIndex >= 0) {
          pickText = " · 已选第 " + (S.selectedHandIndex + 1) + " 张手牌";
        }
        stateText = roundText + " · 你的回合" + pickText + (S.fieldHint ? " · " + S.fieldHint : "");
      } else if (S.turnState === "ai") {
        stateText = roundText + " · 等待 " + playerName(snap.turn_seat) + " 行动";
      } else if (S.turnState === "response-human") {
        stateText = "响应窗口 · 轮到你响应 · 可点场上高亮目标 / 拖拽来源牌 / 或点「不响应」";
      } else if (S.turnState === "response-ai") {
        stateText = "响应窗口 · 等待 " + playerName(effectiveResponder() >= 0 ? effectiveResponder() : 0) + " 响应";
      } else if (S.turnState === "over") {
        var names = [];
        var winners = Array.isArray(snap.winners) ? snap.winners : [];
        for (var i = 0; i < winners.length; i++) {
          var p = playerBySeat(snap, winners[i]);
          if (p) names.push(p.name);
        }
        stateText = "对局结束 · 胜者：" + (names.join("、") || "无");
      } else if (S.turnState === "waiting") {
        stateText = "结算中…";
      }
    }
    setText(S.dom.hintState, stateText);
  }

  /* ============================================================
   * 11. 渲染：弹层（响应 / 终局）
   * ============================================================ */
  function renderModals() {
    var root = S.dom.modalRoot;
    if (!root) return;
    clearNode(root);
    var show = false;
    var isResponse = S.turnState === "response-human" && !!S.snapshot;
    if (isResponse) {
      root.appendChild(buildResponseModal());
      show = true;
    }
    if (S.turnState === "over" && S.snapshot) {
      root.appendChild(buildGameOverModal());
      show = true;
    }
    if (root.classList) {
      if (isResponse) root.classList.add("is-response-layer");
      else root.classList.remove("is-response-layer");
    }
    setHidden(root, !show);
    setHidden(S.dom.rulesModal, !S.rulesOpen);
  }

  function previewSlotEl(slot, card) {
    var wrap = h("div", { class: "preview-slot" });
    wrap.appendChild(h("span", { class: "slot-mark-inline" }, slotMark(slot)));
    if (card) {
      wrap.appendChild(colorCardEl(card, {
        size: "sm",
        showBack: typeof card.other_color === "number" && card.other_color >= 0
      }));
    } else {
      wrap.appendChild(h("div", { class: "preview-empty" }, "空槽"));
    }
    return wrap;
  }

  function buildResponseModal() {
    var snap = S.snapshot;
    var options = S.responseOptions || [];
    var cards = Array.isArray(snap.match) ? snap.match : [null, null];

    var modal = h("div", {
      class: "modal response-modal response-bar",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "响应窗口",
      dataset: { testid: "response-modal" }
    });

    modal.appendChild(h("div", { class: "modal-head" }, [
      h("h2", {}, "轮到你响应"),
      h("span", { class: "log-count" }, "配对响应")
    ]));

    modal.appendChild(h("div", { class: "response-info" }, [
      h("span", { class: "ri-label" }, "响应方式"),
      h("span", { class: "ri-text" }, "点击场上高亮目标 / 拖拽自己的抽牌区牌或身份牌，执行一次免费动作；也可用下方按钮"),
      h("span", { class: "ri-label" }, "目标"),
      h("span", { class: "ri-text" }, "只能是配牌区或任意身份牌；其他玩家的固定牌不可作为响应目标，自己的固定牌可主动移动/替换/翻转；不消耗手牌")
    ]));

    modal.appendChild(h("div", { class: "match-preview" }, [
      previewSlotEl(0, cards[0] || null),
      h("span", { class: "preview-vs" }, "VS"),
      previewSlotEl(1, cards[1] || null)
    ]));

    if (options.length > 0) {
      var list = h("div", { class: "response-options" });
      for (var i = 0; i < options.length; i++) {
        (function (opt, index) {
          var btn = h("button", {
            type: "button",
            class: "action-option response-option " + actionClass(opt.action),
            title: opt.text || actionName(opt.action),
            dataset: { testid: "response-option", optionIndex: String(index) }
          }, [
            h("span", { class: "opt-icon", "aria-hidden": "true" }, actionIcon(opt.action)),
            h("span", { class: "opt-action" }, "【" + actionName(opt.action) + "】"),
            h("span", { class: "opt-text" }, opt.text || actionName(opt.action))
          ]);
          btn.addEventListener("click", function () { onResponseOptionClick(opt); });
          btn.addEventListener("mouseenter", function () { highlightTarget(opt.target); });
          btn.addEventListener("mouseleave", clearTargetHighlights);
          btn.addEventListener("focus", function () { highlightTarget(opt.target); });
          btn.addEventListener("blur", clearTargetHighlights);
          list.appendChild(btn);
        })(options[i], i);
      }
      modal.appendChild(list);
    } else {
      modal.appendChild(h("p", { class: "response-tip is-warn" }, "当前没有可用的响应动作，只能选择不响应。"));
    }

    modal.appendChild(h("p", { class: "response-tip" }, "所有玩家按座位顺序各响应一次；可直接在牌桌上点击 / 拖拽高亮目标，也可以用下方按钮。响应结束后才比较配牌区颜色。不响应不影响手牌。"));

    var passBtn = h("button", { type: "button", class: "btn-ghost", dataset: { testid: "pass-response" } }, "不响应（跳过）");
    passBtn.addEventListener("click", onPassResponseClick);
    modal.appendChild(h("div", { class: "response-actions" }, [passBtn]));

    return modal;
  }

  function buildGameOverModal() {
    var snap = S.snapshot;
    var winners = [];
    var winnerSeats = Array.isArray(snap.winners) ? snap.winners : [];
    for (var i = 0; i < winnerSeats.length; i++) {
      var p = playerBySeat(snap, winnerSeats[i]);
      if (p) winners.push(p);
    }
    var names = [];
    for (var k = 0; k < winners.length; k++) names.push(winners[k].name);
    var humanWon = false;
    for (var m = 0; m < winners.length; m++) if (winners[m].seat === S.humanSeat) humanWon = true;

    var modal = h("div", {
      class: "modal game-over-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "对局结束",
      dataset: { testid: "game-over" }
    });

    modal.appendChild(h("div", { class: "go-emblem", "aria-hidden": "true" }, "♛"));
    modal.appendChild(h("h2", { class: "go-title" }, "对局结束"));

    var winnerLine = h("p", { class: "go-winners" });
    if (humanWon) winnerLine.appendChild(h("span", { class: "go-human" }, "你获胜了！"));
    winnerLine.appendChild(h("span", {}, "胜者：" + (names.join("、") || "无")));
    modal.appendChild(winnerLine);

    var reasons = Array.isArray(snap.win_reasons) ? snap.win_reasons : [];
    if (reasons.length > 0) {
      var reasonBox = h("div", { class: "go-reasons" });
      for (var r = 0; r < reasons.length; r++) reasonBox.appendChild(h("div", { class: "go-reason" }, String(reasons[r])));
      modal.appendChild(reasonBox);
    }

    var scores = h("div", { class: "go-scores" });

    var personalBox = h("div", { class: "go-score-box" });
    personalBox.appendChild(h("div", { class: "go-score-title" }, "最终个人分"));
    var players = Array.isArray(snap.players) ? snap.players : [];
    for (var s = 0; s < players.length; s++) {
      var pl = players[s];
      if (!pl) continue;
      personalBox.appendChild(h("div", { class: "go-score-row" + (pl.is_winner ? " is-winner" : "") }, [
        h("span", { class: "gs-name" }, pl.name),
        h("span", { class: "gs-val" }, (pl.personal || 0) + "/" + winScore())
      ]));
    }
    scores.appendChild(personalBox);
    modal.appendChild(scores);

    var restartBtn = h("button", { type: "button", class: "btn-primary", dataset: { testid: "restart" } }, "再来一局");
    restartBtn.addEventListener("click", onRestartClick);
    var backBtn = h("button", { type: "button", class: "btn-ghost", dataset: { testid: "back-to-menu" } }, "返回设置");
    backBtn.addEventListener("click", backToMenu);
    modal.appendChild(h("div", { class: "go-actions" }, [restartBtn, backBtn]));

    return modal;
  }

  /* ============================================================
   * 12. 流程状态机
   * ============================================================ */
  function setScreen(screen) {
    S.screen = screen;
    document.body.dataset.screen = screen;
  }

  function setTurnState(turnState) {
    S.turnState = turnState;
    document.body.dataset.turnState = turnState;
  }

  function setBusy(busy) { S.busy = !!busy; }

  function clearTimer() {
    S.timerToken += 1;
    if (S.timer !== null) {
      clearTimeout(S.timer);
      S.timer = null;
    }
  }

  function scheduleTimer(fn, delay) {
    clearTimer();
    var token = S.timerToken;
    var session = S.session;
    S.timer = setTimeout(function () {
      S.timer = null;
      if (token !== S.timerToken) return;
      if (session !== S.session) return;
      try { fn(); } catch (err) { reportFatal("延时步骤异常", err); }
    }, Math.max(0, delay));
  }

  function refreshSnapshot() {
    S.snapshot = newGameSnapshot();
    return S.snapshot;
  }

  /** 主调度：根据当前快照 / 阶段决定下一步。 */
  function advanceFlow() {
    clearTimer();
    if (!S.game) {
      setScreen("menu");
      setTurnState("menu");
      setBusy(false);
      renderAll();
      return;
    }
    var snap = refreshSnapshot();
    if (!snap) return;

    if (snap.game_over) { enterGameOver(); return; }

    var P = phaseEnum();
    if (snap.phase === P.RESPONSE) { handleResponseFlow(); return; }
    if (snap.phase === P.ACTION) {
      if (snap.turn_seat === S.humanSeat) { enterHumanTurn(); return; }
      enterAiTurn(); return;
    }
    if (snap.phase === P.GAME_OVER) { enterGameOver(); return; }

    reportFatal("未知对局阶段", String(snap.phase));
    setTurnState("waiting");
    renderAll();
  }

  /* ---------- 人类回合 ---------- */
  function enterHumanTurn() {
    clearTimer();
    var g = S.game;
    if (!g) return;
    try {
      S.legalActions = safeArray(g.get_legal_actions(S.humanSeat));
      S.freeActions = readFreeActions(S.humanSeat);
    } catch (err) {
      reportFatal("读取合法行动失败", err);
      return;
    }
    S.selectedHandIndex = -1;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    setBusy(false);
    setTurnState("human");
    renderAll();
  }

  /* ---------- AI 回合 ---------- */
  function enterAiTurn() {
    clearTimer();
    var snap = S.snapshot;
    if (!snap) return;
    var seat = snap.turn_seat;
    setBusy(true);
    setTurnState("ai");
    renderAll();
    scheduleTimer(function () { runAiTurn(seat); }, S.aiDelay);
  }

  function runAiTurn(seat) {
    var g = S.game;
    if (!g) return;
    var P = phaseEnum();
    if (S.turnState !== "ai" || g.game_over || g.phase !== P.ACTION || g.turn_seat !== seat) {
      advanceFlow();
      return;
    }
    setBusy(true);

    var legal = [];
    var free = [];
    try {
      legal = safeArray(g.get_legal_actions(seat));
      free = readFreeActions(seat);
    } catch (err) {
      reportFatal("AI 读取合法行动失败", err);
      recoverStuck(seat);
      return;
    }

    var choice = null;
    try {
      var ai = env.KKAI;
      if (ai && typeof ai.choose_turn_action === "function") {
        choice = ai.choose_turn_action(g, seat, S.cfg ? S.cfg.ai_difficulty : 1);
      }
    } catch (err) {
      reportFatal("AI 决策异常（" + playerName(seat) + "）", err);
      choice = null;
    }

    var kind = choice && typeof choice.kind === "string" ? choice.kind : "";
    var result = null;
    var usedKind = "";
    try {
      if (kind === "play" || kind === "free" || kind === "free_action") {
        /* 兼容 AI 返回的 kind 与 option 来源不完全对应（例如 free 动作被标成 play）：
           先在对应列表找，再跨列表兜底，最后按 hand_index / free 标记判断执行入口。 */
        var found = null;
        if (kind === "play") found = findOption(legal, choice.option) || findOption(free, choice.option);
        else found = findOption(free, choice.option) || findOption(legal, choice.option);
        if (found) {
          if (found.hand_index !== undefined) {
            result = g.perform_action(seat, found);
            usedKind = "play";
          } else {
            result = performFreeActionApi(seat, found);
            usedKind = "free";
          }
        }
      } else if (!kind && choice && typeof choice.action === "number") {
        /* 兼容 AI 直接返回 {action, target} 形态的选项 */
        var rawFound = findOption(free, choice) || findOption(legal, choice);
        if (rawFound) {
          if (rawFound.hand_index !== undefined) {
            result = g.perform_action(seat, rawFound);
            usedKind = "play";
          } else {
            result = performFreeActionApi(seat, rawFound);
            usedKind = "free";
          }
        }
      }

      if (!result || !result.ok) {
        /* 兜底：先用第一项合法手牌行动，其次免费动作，最后自动跳过，避免死锁 */
        if (legal.length > 0) {
          result = g.perform_action(seat, legal[0]);
          usedKind = "play";
        } else if (free.length > 0) {
          result = performFreeActionApi(seat, free[0]);
          usedKind = "free";
        }
        if (!result || !result.ok) {
          var skipRes = g.auto_skip_turn(seat);
          if (!skipRes || !skipRes.ok) {
            reportFatal("AI 自动跳过失败", skipRes && skipRes.error);
            recoverStuck(seat);
            return;
          }
          S.lastEvent = skipRes.log || (playerName(seat) + " 没有可执行的行动，跳过本回合");
          refreshSnapshot();
          renderAll();
          advanceTurnStep();
          return;
        }
      }
    } catch (err) {
      reportFatal("AI 执行行动异常", err);
      recoverStuck(seat);
      return;
    }

    if (!result || !result.ok) {
      reportFatal("AI 行动失败", result && result.error);
      recoverStuck(seat);
      return;
    }

    S.lastEvent = result.log || (playerName(seat) + " 完成行动" + (usedKind === "free" ? "（免费动作）" : ""));
    if (result.needs_response) {
      refreshSnapshot();
      renderAll();
      advanceFlow();
      return;
    }
    refreshSnapshot();
    renderAll();
    advanceTurnStep();
  }

  function recoverStuck(seat) {
    var g = S.game;
    if (!g) return;
    setBusy(false);
    try {
      if (g.phase === phaseEnum().ACTION && g.turn_seat === seat) {
        var legal = safeArray(g.get_legal_actions(seat));
        var free = readFreeActions(seat);
        var result = null;
        if (legal.length > 0) result = g.perform_action(seat, legal[0]);
        else if (free.length > 0) result = performFreeActionApi(seat, free[0]);
        if (result && result.ok) {
          S.lastEvent = result.log || (playerName(seat) + " 完成兜底行动");
          refreshSnapshot();
          renderAll();
          if (result.needs_response) { advanceFlow(); return; }
          advanceTurnStep();
          return;
        }
        var skip = g.auto_skip_turn(seat);
        if (skip && skip.ok) {
          S.lastEvent = skip.log || (playerName(seat) + " 自动跳过");
          refreshSnapshot();
          renderAll();
          advanceTurnStep();
          return;
        }
      }
    } catch (err) {
      reportFatal("兜底行动异常", err);
      return;
    }
    setTurnState("waiting");
    renderAll();
  }

  function advanceTurnStep() {
    var g = S.game;
    if (!g) return;
    if (g.game_over) { advanceFlow(); return; }
    setTurnState("waiting");
    var result = null;
    try {
      result = g.advance_turn();
    } catch (err) {
      reportFatal("推进回合异常", err);
      return;
    }
    if (!result || !result.ok) {
      /* 兜底：若上一步行动没被记录，先 auto_skip 再推进 */
      try {
        var skip = g.auto_skip_turn(g.turn_seat);
        if (skip && skip.ok) result = g.advance_turn();
      } catch (err2) {
        reportFatal("推进回合兜底异常", err2);
        return;
      }
    }
    if (!result || !result.ok) {
      reportFatal("推进回合失败", result && result.error);
      return;
    }
    S.lastTurnReport = result.turn_report || null;
    advanceFlow();
  }

  /* ---------- 响应窗口 ---------- */
  function handleResponseFlow() {
    clearTimer();
    var g = S.game;
    if (!g) return;
    refreshSnapshot();
    var responder = -1;
    try {
      responder = g.get_current_responder();
    } catch (err) {
      reportFatal("读取响应者失败", err);
      return;
    }
    if (responder === -1) { runResolveMatch(); return; }
    if (responder === S.humanSeat) { enterHumanResponse(); return; }
    enterAiResponse(responder);
  }

  function enterHumanResponse() {
    var g = S.game;
    if (!g) return;
    try {
      S.responseOptions = safeArray(g.get_response_options());
    } catch (err) {
      reportFatal("读取响应选项失败", err);
      S.responseOptions = [];
    }
    S.responseSource = null;
    S.selectedFreeAction = -1;
    S.selectedHandIndex = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    setBusy(false);
    setTurnState("response-human");
    renderAll();
  }

  function enterAiResponse(responder) {
    S.responseSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    setBusy(true);
    setTurnState("response-ai");
    renderAll();
    scheduleTimer(function () { runAiResponse(responder); }, S.aiDelay);
  }

  function runAiResponse(responder) {
    var g = S.game;
    if (!g) return;
    if (S.turnState !== "response-ai") { advanceFlow(); return; }

    var current = -1;
    try { current = g.get_current_responder(); } catch (err) { reportFatal("读取响应者失败", err); return; }
    if (current !== responder) { advanceFlow(); return; }

    var options = [];
    try { options = safeArray(g.get_response_options()); } catch (err) { options = []; }

    var choice = null;
    try {
      var ai = env.KKAI;
      if (ai && typeof ai.choose_response === "function") {
        choice = ai.choose_response(g, responder, S.cfg ? S.cfg.ai_difficulty : 1);
      }
    } catch (err) {
      reportFatal("AI 响应决策异常（" + playerName(responder) + "）", err);
      choice = null;
    }

    var result = null;
    try {
      if (choice && choice.respond) {
        var opt = findOption(options, choice.option);
        if (opt) result = g.respond(opt);
      }
      if (!result || !result.ok) result = g.pass_response();
    } catch (err) {
      reportFatal("AI 响应执行异常", err);
      return;
    }
    if (!result || !result.ok) {
      reportFatal("AI 响应失败", result && result.error);
      return;
    }

    S.lastEvent = result.log || (playerName(responder) + " 不响应");
    refreshSnapshot();
    renderAll();
    advanceFlow();
  }

  function runResolveMatch() {
    var g = S.game;
    if (!g) return;
    S.responseSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    setTurnState("waiting");
    setBusy(true);
    renderAll();

    var result = null;
    try { result = g.resolve_match(); } catch (err) { reportFatal("配对结算异常", err); return; }
    if (!result || !result.ok) {
      reportFatal("配对结算失败", result && result.error);
      return;
    }

    S.lastMatchResult = {
      success: !!result.success,
      invalid: !!result.invalid,
      color: result.color,
      slot_colors: result.slot_colors || [],
      personal_gained: result.personal_gained || [],
      game_over: !!result.game_over
    };
    S.lastEvent = result.log || "配对结算完成";
    refreshSnapshot();
    renderAll();

    if (result.game_over) { enterGameOver(); return; }
    advanceTurnStep();
  }

  function enterGameOver() {
    clearTimer();
    refreshSnapshot();
    setBusy(false);
    var snap = S.snapshot;
    if (snap && Array.isArray(snap.winners) && snap.winners.length > 0) {
      var names = [];
      for (var i = 0; i < snap.winners.length; i++) {
        var p = playerBySeat(snap, snap.winners[i]);
        if (p) names.push(p.name);
      }
      S.lastEvent = "对局结束 · 胜者：" + names.join("、");
    } else {
      S.lastEvent = "对局结束";
    }
    setTurnState("over");
    renderAll();
  }

  /* ============================================================
   * 13. 人类交互处理
   * ============================================================ */
  /** 人类操作异常/被拒绝后把界面恢复到与引擎一致的稳定状态，避免卡在 waiting。 */
  function recoverAfterHumanError() {
    var g = S.game;
    if (!g) {
      setScreen("menu");
      setTurnState("menu");
      setBusy(false);
      renderAll();
      return;
    }
    try {
      var P = phaseEnum();
      if (g.game_over || g.phase === P.GAME_OVER) { enterGameOver(); return; }
      if (g.phase === P.ACTION && g.turn_seat === S.humanSeat) { enterHumanTurn(); return; }
      if (g.phase === P.RESPONSE) { advanceFlow(); return; }
    } catch (err) {
      /* 落到 advanceFlow 再兜底 */
    }
    advanceFlow();
  }

  function onHandCardClick(handIndex) {
    if (S.turnState !== "human") return;
    var me = playerBySeat(S.snapshot, S.humanSeat);
    var handLen = me && Array.isArray(me.hand) ? me.hand.length : 0;
    if (handIndex < 0 || handIndex >= handLen) return;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.fieldHint = "";
    S.selectedHandIndex = S.selectedHandIndex === handIndex ? -1 : handIndex;
    clearTargetHighlights();
    clearHoverTargets();
    renderAll();
  }

  /* ---------- 免费动作（移动 / 替换 / 翻转） ---------- */
  function onFreeActionClick(action) {
    if (S.turnState !== "human") return;
    if (countFreeOptions(action) === 0) return;
    S.selectedHandIndex = -1;
    S.selectedSource = null;
    S.fieldHint = "";
    S.selectedFreeAction = S.selectedFreeAction === action ? -1 : action;
    clearTargetHighlights();
    clearHoverTargets();
    renderAll();
  }

  function onFreeActionOptionClick(option) {
    var g = S.game;
    if (!g || S.turnState !== "human") return;
    setTurnState("waiting"); /* 立即锁定输入，防双击重复提交 */
    setBusy(true);
    var result = null;
    try {
      result = performFreeActionApi(S.humanSeat, option);
    } catch (err) {
      setBusy(false);
      reportFatal("执行免费动作异常", err);
      recoverAfterHumanError();
      return;
    }
    if (!result || !result.ok) {
      setBusy(false);
      reportFatal("免费动作被拒绝", result ? result.error : "引擎未提供 perform_free_action");
      recoverAfterHumanError();
      return;
    }
    setBusy(false);
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.selectedHandIndex = -1;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    clearTargetHighlights();
    S.lastEvent = result.log || (playerName(S.humanSeat) + " 完成免费动作");
    refreshSnapshot();
    renderAll();
    if (result.needs_response) {
      advanceFlow();
      return;
    }
    advanceTurnStep();
  }

  function onActionOptionClick(option) {
    var g = S.game;
    if (!g || S.turnState !== "human") return;
    setTurnState("waiting"); /* 立即锁定输入，防双击重复提交 */
    setBusy(true);
    var result = null;
    try {
      result = g.perform_action(S.humanSeat, option);
    } catch (err) {
      setBusy(false);
      reportFatal("执行行动异常", err);
      recoverAfterHumanError();
      return;
    }
    if (!result || !result.ok) {
      setBusy(false);
      reportFatal("行动被拒绝", result && result.error);
      recoverAfterHumanError();
      return;
    }
    setBusy(false);
    S.selectedHandIndex = -1;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    clearTargetHighlights();
    if (result.action === actionEnum().MATCH) S.lastMatchResult = null;
    S.lastEvent = result.log || (playerName(S.humanSeat) + " 完成行动");
    refreshSnapshot();

    if (result.needs_response) {
      renderAll();
      advanceFlow();
      return;
    }
    renderAll();
    advanceTurnStep();
  }

  function onSkipTurnClick() {
    var g = S.game;
    if (!g || S.turnState !== "human") return;
    setTurnState("waiting");
    setBusy(true);
    var result = null;
    try {
      result = g.auto_skip_turn(S.humanSeat);
    } catch (err) {
      setBusy(false);
      reportFatal("跳过回合异常", err);
      recoverAfterHumanError();
      return;
    }
    if (!result || !result.ok) {
      setBusy(false);
      reportFatal("跳过回合失败", result && result.error);
      recoverAfterHumanError();
      return;
    }
    setBusy(false);
    S.selectedHandIndex = -1;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    S.lastEvent = result.log || (playerName(S.humanSeat) + " 没有可执行的行动，跳过本回合");
    refreshSnapshot();
    renderAll();
    advanceTurnStep();
  }

  function onResponseOptionClick(option) {
    var g = S.game;
    if (!g || S.turnState !== "response-human") return;
    setTurnState("waiting");
    setBusy(true);
    var result = null;
    try { result = g.respond(option); } catch (err) {
      setBusy(false);
      reportFatal("执行响应异常", err);
      recoverAfterHumanError();
      return;
    }
    if (!result || !result.ok) {
      setBusy(false);
      reportFatal("响应被拒绝", result && result.error);
      recoverAfterHumanError();
      return;
    }
    setBusy(false);
    S.responseSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    S.lastEvent = result.log || "响应完成";
    refreshSnapshot();
    renderAll();
    advanceFlow();
  }

  function onPassResponseClick() {
    var g = S.game;
    if (!g || S.turnState !== "response-human") return;
    setTurnState("waiting");
    setBusy(true);
    var result = null;
    try { result = g.pass_response(); } catch (err) {
      setBusy(false);
      reportFatal("不响应异常", err);
      recoverAfterHumanError();
      return;
    }
    if (!result || !result.ok) {
      setBusy(false);
      reportFatal("不响应失败", result && result.error);
      recoverAfterHumanError();
      return;
    }
    setBusy(false);
    S.responseSource = null;
    S.dragSource = null;
    S.fieldHint = "";
    endDragVisuals();
    S.lastEvent = result.log || "不响应";
    refreshSnapshot();
    renderAll();
    advanceFlow();
  }

  function onRestartClick() {
    var base = S.cfg || {};
    var cfg = {
      player_count: base.player_count || S.menu.players,
      color_count: base.color_count || S.menu.colors,
      ai_difficulty: base.ai_difficulty !== undefined ? base.ai_difficulty : S.menu.difficulty,
      seed: randomSeed(),
      human_seat: base.human_seat || 0,
      all_ai: false,
      first_seat: 0
    };
    S.menu.seed = cfg.seed;
    if (S.dom.seedInput) S.dom.seedInput.value = String(cfg.seed);
    startGame(cfg);
  }

  function backToMenu() {
    clearTimer();
    S.session += 1;
    S.game = null;
    S.snapshot = null;
    S.selectedHandIndex = -1;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.responseSource = null;
    S.fieldHint = "";
    endDragVisuals();
    S.legalActions = [];
    S.freeActions = [];
    S.responseOptions = [];
    S.lastMatchResult = null;
    S.lastTurnReport = null;
    S.lastEvent = "";
    S.rulesOpen = false;
    S.busy = false;
    setScreen("menu");
    setTurnState("menu");
    setBusy(false);
    setHidden(S.dom.modalRoot, true);
    clearNode(S.dom.modalRoot);
    setHidden(S.dom.rulesModal, true);
    updateMenuUI();
    renderAll();
  }

  /* ============================================================
   * 14. 启动 / 重开对局
   * ============================================================ */
  function startGame(cfgInput) {
    clearTimer();
    var G = env.KKGame;
    if (!env.KKDefs || !G) {
      reportFatal("无法开始对局", "缺少引擎脚本（js/defs.js 或 js/engine.js 未加载）");
      return false;
    }

    var cfg;
    try { cfg = normalizeCfg(cfgInput || {}); } catch (err) { reportFatal("对局配置异常", err); return false; }

    S.session += 1;
    var game = null;
    var setupResult = null;
    try {
      game = new G();
      setupResult = game.setup(cfg);
    } catch (err) {
      reportFatal("对局初始化异常", err);
      return false;
    }
    if (!setupResult || setupResult.ok === false) {
      reportFatal("对局初始化失败", setupResult && setupResult.error);
      return false;
    }

    S.game = game;
    S.cfg = cfg;
    S.humanSeat = typeof setupResult.human_seat === "number" ? setupResult.human_seat : cfg.human_seat;
    S.selectedHandIndex = -1;
    S.selectedFreeAction = -1;
    S.selectedSource = null;
    S.dragSource = null;
    S.responseSource = null;
    S.fieldHint = "";
    endDragVisuals();
    S.legalActions = [];
    S.freeActions = [];
    S.responseOptions = [];
    S.lastMatchResult = null;
    S.lastTurnReport = setupResult.turn_report || null;
    S.lastError = null;
    S.busy = false;
    hideErrorBar();

    /* 用对局开始日志作为“最后一手” */
    var startLine = "";
    var lines = Array.isArray(game.log_lines) ? game.log_lines : [];
    for (var i = 0; i < lines.length; i++) {
      if (String(lines[i]).indexOf("对局开始") === 0) { startLine = lines[i]; break; }
    }
    S.lastEvent = startLine || "对局开始";

    setScreen("game");
    setTurnState("waiting");
    refreshSnapshot();
    renderAll();
    advanceFlow();
    return true;
  }

  /* ============================================================
   * 15. 对外 API：window.KKApp（SPEC 3.6）
   * ============================================================ */
  global.KKApp = {
    startGame: startGame,
    getGame: function () { return S.game; },
    getHumanSeat: function () { return S.humanSeat; },
    getSnapshot: function () {
      if (!S.game) return null;
      try { return S.game.get_snapshot(S.humanSeat); } catch (err) { reportFatal("读取快照异常", err); return null; }
    },
    getState: function () {
      var snap = S.snapshot;
      return {
        screen: S.screen,
        turnState: S.turnState,
        humanSeat: S.humanSeat,
        round: snap ? snap.round : 0,
        turn_seat: snap ? snap.turn_seat : -1,
        phase: snap ? snap.phase : -1,
        game_over: snap ? !!snap.game_over : false,
        busy: !!S.busy || S.turnState === "ai" || S.turnState === "response-ai" || S.turnState === "waiting",
        selectedHandIndex: S.selectedHandIndex,
        selectedFreeAction: S.selectedFreeAction,
        fast: S.fast,
        aiDelay: S.aiDelay,
        lastEvent: S.lastEvent,
        error: S.lastError
      };
    },
    getLastError: function () { return S.lastError; },
    /* 供 Node 侧纯函数测试的调试入口（不影响正式契约） */
    _debug: {
      parseUrlConfig: parseUrlConfig,
      normalizeCfg: normalizeCfg,
      randomSeed: randomSeed,
      colorName: colorName,
      actionName: actionName,
      phaseText: phaseText
    }
  };

  /* ============================================================
   * 16. 初始化
   * ============================================================ */
  function init() {
    try {
      cacheDom();
      bindStaticEvents();

      var parsed = parseUrlConfig(global.location ? global.location.search : "", randomSeed());
      applyUrlToMenu(parsed);
      updateMenuUI();

      setScreen("menu");
      setTurnState("menu");
      renderAll();

      if (parsed.autostart) {
        setTimeout(function () {
          try {
            if (!startGame(parsed.cfg)) {
              /* 失败时错误条已显示，保持菜单可操作 */
              setScreen("menu");
              setTurnState("menu");
            }
          } catch (err) {
            reportFatal("自动开局异常", err);
          }
        }, 30);
      }
    } catch (err) {
      reportFatal("界面初始化异常", err);
    }
  }

  init();
})(typeof window !== "undefined" ? window : globalThis);
