/**
 * 《卡卡牌》AI 对手 —— 全局 KKAI（新版规则：免费动作 / 身份区 / 全员响应窗口）
 *
 * 对外契约（保持与旧版一致的两个入口）：
 *   KKAI.choose_turn_action(game, seat, difficulty)
 *     -> {kind:"free", option}   option 来自 game.get_free_actions(seat)
 *      | {kind:"play", option}   option 来自 game.get_legal_actions(seat)
 *      | {}                      无任何合法行动（控制器兜底 auto_skip_turn）
 *   KKAI.choose_response(game, seat, difficulty)
 *     -> {respond:true, option}  option 来自 game.get_response_options()
 *      | {respond:false}
 *
 * 只通过公开 API / snapshot 决策：get_free_actions / get_legal_actions /
 * get_response_options / get_snapshot(seat)。不读引擎私有字段，不改快照与选项对象。
 *
 * 新规则要点（详见 docs/RULES.md）：
 * - 每回合一次行动：免费动作（移动/替换/翻转，不消耗手牌）或打出一张手牌
 *   （配对/固定/移除）。
 * - 移动/替换的 target 是扁平结构：
 *   {zone:来源区域(DRAW=1/IDENTITY=2), seat:来源座位, card_uid:来源牌,
 *    to_zone:目标区域(MATCH=3/IDENTITY=2), to_seat:目标身份区座位(配牌区-1), slot:目标配牌槽}
 * - FLIP / FIX / REMOVE 的 target 是位置结构：
 *   {zone:目标所在区, seat:所属座位, slot:配牌槽或-1, card_uid}
 * - 没有阵营分、没有暗置牌、没有响应槽；身份区可能为空（identity=null）。
 * - 配对结算：两槽同色时，所有身份区非空且身份颜色相同者个人分 +1；个人分先到 5 者胜。
 *
 * 决策思路（启发式，难度只影响力度/细致度）：
 * 1. 把「配对区当前两槽颜色」当作即时可得收益/威胁：若自己身份色与两槽同色，
 *    配对能拿分/获胜；若有对手差 1 分且该色匹配，则必须拆。
 * 2. 免费动作按「结算后场面对自己的价值」评分：优先凑自己的颜色、补空身份区、
 *    拆对手快获胜的同色对、剥离/替换对手身份色；避免无意义的翻转。
 * 3. 手牌：配对只在能得分/获胜时打出；移除优先拆对手（个人分>=4）的身份牌或
 *    即将结算的危险同色对；固定用于保护自己的关键身份牌/已摆好的配牌。
 * 4. 响应窗口：对每个免费动作模拟「结算后两槽颜色 + 各玩家身份色」，估算对
 *    自己的结算收益变化（以及身份色变化带来的未来价值），只有明显有利才响应，
 *    否则跳过，避免无脑翻牌/拆牌导致对局僵持。
 *
 * 通用 JS 约定：classic script、一个 IIFE、挂 window / globalThis；无 DOM/BOM；
 * 不使用 Math.random（难度 0 的随机由「种子 + 局面」派生的确定性 RNG 提供）。
 */
(function (global) {
  "use strict";

  // =============================================================
  // 常量 / 枚举
  // =============================================================

  const KKDefs = global.KKDefs || {};
  const ACT = KKDefs.Action || { MOVE: 0, REPLACE: 1, FLIP: 2, MATCH: 3, FIX: 4, REMOVE: 5 };
  const ZONE = KKDefs.Zone || { DECK: 0, DRAW: 1, IDENTITY: 2, MATCH: 3, DISCARD: 4 };
  const WIN_SCORE = 5;

  // 难度 0 的确定性随机种子派生常数（与旧版一致，便于复现）
  const SEED_MUL = 7919;
  const SEED_SEAT = 104729;
  const SEED_ROUND = 1299709;

  // 评分权重
  const THREAT_PENALTY = 20.0; // 对手即将获胜的惩罚基数
  const WIN_BONUS = 100.0; // 自己即将获胜的收益
  const LATE_GAME_ROUND = 60; // 长局阈值（保留给调参/文档）
  const HAND_COST = 0.35; // 打出手牌的隐性成本（相对免费动作）

  // =============================================================
  // 通用小工具
  // =============================================================

  /** JS 普通对象（排除 null / 数组）。 */
  function is_dict(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
  }

  /** 仅当 key 存在时返回对象字段，否则默认值。 */
  function dget(obj, key, def) {
    if (!is_dict(obj) || !Object.prototype.hasOwnProperty.call(obj, key)) return def;
    return obj[key];
  }

  function to_int(v) {
    if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    }
    return 0;
  }

  function dint(obj, key, def) {
    return to_int(dget(obj, key, def));
  }

  function dbool(obj, key, def) {
    return !!dget(obj, key, def);
  }

  function as_array(v) {
    return Array.isArray(v) ? v : [];
  }

  function clamp(v, lo, hi) {
    if (!Number.isFinite(v)) return lo;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function _normDifficulty(difficulty) {
    if (difficulty === undefined || difficulty === null) return 1;
    const d = to_int(difficulty);
    return d < 0 ? 0 : d > 2 ? 2 : d;
  }

  // =============================================================
  // 引擎公开 API 的容错访问
  // =============================================================

  function _getFreeActions(game, seat) {
    if (!game || typeof game.get_free_actions !== "function") return [];
    try {
      const list = game.get_free_actions(seat);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function _getLegalActions(game, seat) {
    if (!game || typeof game.get_legal_actions !== "function") return [];
    try {
      const list = game.get_legal_actions(seat);
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function _getResponseOptions(game, seat) {
    if (!game || typeof game.get_response_options !== "function") return [];
    // 新契约是无参；对带 seat 的旧签名做一次宽容兼容。
    try {
      const list = game.get_response_options();
      if (Array.isArray(list)) return list;
    } catch (err) {
      /* try next */
    }
    try {
      const list2 = game.get_response_options(seat);
      return Array.isArray(list2) ? list2 : [];
    } catch (err2) {
      return [];
    }
  }

  function _getSnapshot(game, seat) {
    if (!game || typeof game.get_snapshot !== "function") return null;
    try {
      const snap = game.get_snapshot(seat);
      return is_dict(snap) ? snap : null;
    } catch (err) {
      return null;
    }
  }

  // =============================================================
  // 快照 → 内部局面（全部是公开信息 + 自己可见的私有信息）
  // =============================================================

  function _cardSnap(card) {
    if (!is_dict(card)) return null;
    return {
      uid: dint(card, "uid", -1),
      color: dint(card, "color", -1),
      other: dint(card, "other_color", -1), // -1 = 背面不可见
      fixed: dbool(card, "fixed", false),
      owner: dint(card, "owner", -1),
      zone: dint(card, "zone", -1),
    };
  }

  function _personSnap(p, fallbackSeat) {
    const seat = dint(p, "seat", fallbackSeat);
    const idCard = dget(p, "identity", null);
    const identity = _cardSnap(idCard);
    const draw = [];
    const drawRaw = as_array(dget(p, "draw", []));
    for (let i = 0; i < drawRaw.length; i++) {
      const card = _cardSnap(drawRaw[i]);
      if (card) draw.push(card);
    }
    const hand = as_array(dget(p, "hand", [])).map(to_int);
    return {
      seat: seat,
      name: String(dget(p, "name", "玩家" + (seat + 1))),
      personal: dint(p, "personal", 0),
      identity: identity,
      identityColor: identity ? identity.color : -1,
      identityOther: identity ? identity.other : -1,
      identityFixed: identity ? identity.fixed : false,
      draw: draw,
      hand: hand,
      handCount: dint(p, "hand_count", hand.length),
    };
  }

  function _buildState(snap, seat) {
    const playersRaw = as_array(dget(snap, "players", []));
    const bySeat = [];
    const players = [];
    let maxSeat = -1;
    for (let i = 0; i < playersRaw.length; i++) {
      if (!is_dict(playersRaw[i])) continue;
      const ps = _personSnap(playersRaw[i], i);
      if (!Number.isFinite(ps.seat) || ps.seat < 0) ps.seat = i;
      bySeat[ps.seat] = ps;
      if (ps.seat > maxSeat) maxSeat = ps.seat;
    }
    for (let s = 0; s <= maxSeat; s++) {
      if (!bySeat[s]) {
        // 理论不会出现座位空洞；容错补一个空玩家
        bySeat[s] = _personSnap({ seat: s, name: "玩家" + (s + 1) }, s);
      }
      players.push(bySeat[s]);
    }
    const n = players.length;
    const activeRaw = as_array(dget(snap, "active_colors", []));
    const active = [];
    for (let i = 0; i < activeRaw.length; i++) active.push(to_int(activeRaw[i]));
    if (active.length === 0) active.push(0, 1, 2, 3);
    const matchRaw = as_array(dget(snap, "match", []));
    const pair = [null, null];
    for (let i = 0; i < 2; i++) pair[i] = _cardSnap(matchRaw[i]);
    const st = {
      seat: seat,
      n: n,
      players: players,
      bySeat: bySeat,
      active: active,
      k: active.length,
      pair: pair,
      pairColors: [pair[0] ? pair[0].color : -1, pair[1] ? pair[1].color : -1],
      round: dint(snap, "round", 0),
      phase: dint(snap, "phase", -1),
      matcher: dint(snap, "matcher", -1),
      turnSeat: dint(snap, "turn_seat", -1),
      myHand: bySeat[seat] ? bySeat[seat].hand.slice() : [],
    };
    st.myColor = bySeat[seat] ? bySeat[seat].identityColor : -1;
    st.myPersonal = bySeat[seat] ? bySeat[seat].personal : 0;
    st.myIdentity = bySeat[seat] ? bySeat[seat].identity : null;
    st.pairFilled = pair[0] !== null && pair[1] !== null;
    st.pairSame = st.pairFilled && st.pairColors[0] === st.pairColors[1];
    st.pairFixed = !!(pair[0] && pair[0].fixed && pair[1] && pair[1].fixed);
    // 长局防僵局：多人在 3~4 分时互相拆对会让对局永不结束。
    // 超过 LATE_GAME_ROUND 后 AI 降低「阻止别人得分」的权重，优先让对局收束。
    st.lateGame = st.round >= LATE_GAME_ROUND;
    return st;
  }

  function _player(st, seat) {
    if (seat === undefined || seat === null || seat < 0) return null;
    return st.bySeat[seat] || null;
  }

  function _currentIdColors(st) {
    const arr = new Array(st.n);
    for (let s = 0; s < st.n; s++) arr[s] = -1;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat >= 0 && p.seat < st.n) arr[p.seat] = p.identityColor;
    }
    return arr;
  }

  function _findDrawCard(st, seat, uid) {
    const p = _player(st, seat);
    if (!p) return null;
    for (let i = 0; i < p.draw.length; i++) {
      if (p.draw[i].uid === uid) return p.draw[i];
    }
    return null;
  }

  function _findIdentityByUid(st, uid) {
    if (uid < 0) return null;
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.identity && p.identity.uid === uid) return { seat: p.seat, card: p.identity };
    }
    return null;
  }

  /**
   * 把 target 里的位置（zone/seat/slot/card_uid）解析成具体牌。
   * 返回 { zone, seat, slot, card } 或 null。
   */
  function _locateCard(st, loc) {
    if (!loc) return null;
    const zone = loc.zone;
    let seat = loc.seat;
    let slot = loc.slot;
    const uid = loc.uid;
    if (zone === ZONE.MATCH) {
      let card = slot >= 0 && slot < 2 ? st.pair[slot] : null;
      if (card && (uid < 0 || card.uid === uid)) {
        return { zone: zone, seat: card.owner, slot: slot, card: card };
      }
      for (let i = 0; i < 2; i++) {
        if (st.pair[i] && st.pair[i].uid === uid) {
          return { zone: zone, seat: st.pair[i].owner, slot: i, card: st.pair[i] };
        }
      }
      return null;
    }
    if (zone === ZONE.IDENTITY) {
      if (seat >= 0) {
        const p = _player(st, seat);
        if (p && p.identity && (uid < 0 || p.identity.uid === uid)) {
          return { zone: zone, seat: seat, slot: -1, card: p.identity };
        }
      }
      const found = _findIdentityByUid(st, uid);
      if (found) return { zone: zone, seat: found.seat, slot: -1, card: found.card };
      return null;
    }
    if (zone === ZONE.DRAW) {
      if (uid < 0) return null;
      if (seat >= 0) {
        const card = _findDrawCard(st, seat, uid);
        if (card) return { zone: zone, seat: seat, slot: -1, card: card };
      }
      for (let i = 0; i < st.players.length; i++) {
        const card2 = _findDrawCard(st, st.players[i].seat, uid);
        if (card2) return { zone: zone, seat: st.players[i].seat, slot: -1, card: card2 };
      }
      return null;
    }
    return null;
  }

  // =============================================================
  // 选项解析（新规则扁平 target）
  // =============================================================

  /**
   * 解析一个 option。
   * MOVE / REPLACE: {action, from:{zone,seat,uid}, to:{zone,seat,slot}, srcColor,...}
   * FLIP / FIX / REMOVE: {action, loc:{zone,seat,slot,uid}}
   * 无法识别时返回 null。
   */
  function _parseOption(st, option) {
    if (!option || typeof option !== "object") return null;
    const action = dint(option, "action", -1);
    const rawTarget = dget(option, "target", null);
    const target = is_dict(rawTarget) ? rawTarget : {};
    if (action === ACT.MOVE || action === ACT.REPLACE) {
      const from = {
        zone: dint(target, "zone", -1),
        seat: dint(target, "seat", -1),
        uid: dint(target, "card_uid", -1),
      };
      let toZone = dint(target, "to_zone", -1);
      let toSeat = dint(target, "to_seat", -1);
      const slot = dint(target, "slot", -1);
      if (toZone < 0) {
        // 宽容回退（正常契约一定带 to_zone）
        if (slot >= 0) toZone = ZONE.MATCH;
        else if (toSeat >= 0) toZone = ZONE.IDENTITY;
      }
      if (from.zone < 0) from.zone = ZONE.DRAW; // 来源缺省按自己的抽牌区处理
      if (toZone < 0) return null;
      return {
        action: action,
        from: from,
        to: { zone: toZone, seat: toSeat, slot: slot },
        loc: null,
        srcColor: -1,
        oldColor: -1,
        oldIdColor: -1,
        pChange: 0,
      };
    }
    if (action === ACT.FLIP || action === ACT.FIX || action === ACT.REMOVE) {
      const loc = {
        zone: dint(target, "zone", -1),
        seat: dint(target, "seat", -1),
        slot: dint(target, "slot", -1),
        uid: dint(target, "card_uid", -1),
      };
      if (loc.zone < 0 && loc.slot >= 0) loc.zone = ZONE.MATCH;
      if (loc.zone < 0) return null;
      return {
        action: action,
        from: null,
        to: null,
        loc: loc,
        srcColor: -1,
        oldColor: -1,
        oldIdColor: -1,
        pChange: 0,
      };
    }
    return null;
  }

  // =============================================================
  // 翻面未知颜色的先验分布
  //   每种活跃颜色：3 张同色牌 + 每种其它颜色 2 张（朝上为该色的牌）
  //   已知朝上颜色 C 时，背面为 C 概率 3/D，为其它色各 2/D，D = 3 + 2*(k-1)。
  // =============================================================

  function _backDist(st, upColor) {
    const active = st.active && st.active.length ? st.active : [0, 1, 2, 3];
    const k = active.length;
    const D = 3 + 2 * (k - 1);
    const out = [];
    const seen = {};
    let total = 0;
    for (let i = 0; i < active.length; i++) {
      const c = active[i];
      if (Object.prototype.hasOwnProperty.call(seen, c)) continue;
      seen[c] = true;
      const p = c === upColor ? 3 / D : 2 / D;
      out.push({ color: c, prob: p });
      total += p;
    }
    if (!Object.prototype.hasOwnProperty.call(seen, upColor) && upColor >= 0) {
      out.push({ color: upColor, prob: 3 / D });
      total += 3 / D;
    }
    if (total <= 0) {
      return upColor >= 0 ? [{ color: upColor, prob: 1 }] : [{ color: -1, prob: 1 }];
    }
    for (let i = 0; i < out.length; i++) out[i].prob /= total;
    return out;
  }

  function _changeProb(st, upColor) {
    const dist = _backDist(st, upColor);
    for (let i = 0; i < dist.length; i++) {
      if (dist[i].color === upColor) return 1 - dist[i].prob;
    }
    return 1;
  }

  // =============================================================
  // 动作模拟：返回若干「可能结果」场景（未知翻面用分布展开）
  //   场景 = {prob, pairColors[2], idColors[seat]}
  // =============================================================

  function _expandFlip(st, templateFactory, upColor, meta, apply) {
    const dist = _backDist(st, upColor);
    const out = [];
    for (let i = 0; i < dist.length; i++) {
      const sc = templateFactory();
      sc.prob = dist[i].prob;
      apply(sc, dist[i].color);
      out.push(sc);
    }
    return { scenarios: out, meta: meta };
  }

  /**
   * 模拟执行一个动作对「配牌区两槽颜色 + 各玩家身份颜色」的影响。
   * 不模拟抽牌区/手牌/固定状态的后续变化（评分里单独处理）。
   */
  function _simulate(st, option) {
    const meta = _parseOption(st, option);
    if (!meta) return null;
    const pairColors = st.pairColors.slice();
    const idColors = _currentIdColors(st);
    const factory = function () {
      return {
        prob: 1,
        pairColors: pairColors.slice(),
        idColors: idColors.slice(),
        meta: meta,
      };
    };
    switch (meta.action) {
      case ACT.FLIP: {
        const loc = _locateCard(st, meta.loc);
        if (!loc || !loc.card) return { scenarios: [factory()], meta: meta };
        // 固定牌只有主人可以翻（翻转会取消固定）；其他玩家不能翻。
        if (loc.card.fixed && loc.card.owner !== st.seat) return { scenarios: [factory()], meta: meta };
        if (loc.zone === ZONE.MATCH) {
          if (loc.slot < 0 || loc.slot > 1) return { scenarios: [factory()], meta: meta };
          if (loc.card.other >= 0) {
            pairColors[loc.slot] = loc.card.other;
            meta.pChange = loc.card.other === loc.card.color ? 0 : 1;
            return { scenarios: [factory()], meta: meta };
          }
          meta.pChange = _changeProb(st, loc.card.color);
          return _expandFlip(st, factory, loc.card.color, meta, function (sc, color) {
            sc.pairColors[loc.slot] = color;
          });
        }
        if (loc.zone === ZONE.IDENTITY) {
          if (loc.card.other >= 0) {
            idColors[loc.seat] = loc.card.other;
            meta.pChange = loc.card.other === loc.card.color ? 0 : 1;
            return { scenarios: [factory()], meta: meta };
          }
          meta.pChange = _changeProb(st, loc.card.color);
          return _expandFlip(st, factory, loc.card.color, meta, function (sc, color) {
            sc.idColors[loc.seat] = color;
          });
        }
        // 翻抽牌区的牌：不影响配对结算，评分里按「浪费」处理
        return { scenarios: [factory()], meta: meta };
      }
      case ACT.MOVE:
      case ACT.REPLACE: {
        // 解析来源牌颜色
        let srcColor = -1;
        if (meta.from.zone === ZONE.IDENTITY) {
          const p = _player(st, meta.from.seat);
          if (p && p.identity && (meta.from.uid < 0 || p.identity.uid === meta.from.uid)) {
            srcColor = p.identity.color;
          }
        } else {
          const srcSeat = meta.from.seat >= 0 ? meta.from.seat : st.seat;
          const card = _findDrawCard(st, srcSeat, meta.from.uid);
          if (card) srcColor = card.color;
        }
        if (srcColor < 0) return { scenarios: [factory()], meta: meta };
        meta.srcColor = srcColor;
        if (meta.from.zone === ZONE.IDENTITY) idColors[meta.from.seat] = -1;
        if (meta.to.zone === ZONE.MATCH) {
          if (meta.to.slot >= 0 && meta.to.slot < 2) {
            meta.oldColor = st.pairColors[meta.to.slot];
            pairColors[meta.to.slot] = srcColor;
          }
        } else if (meta.to.zone === ZONE.IDENTITY) {
          const target = _player(st, meta.to.seat);
          meta.oldIdColor = target ? target.identityColor : -1;
          idColors[meta.to.seat] = srcColor;
        }
        return { scenarios: [factory()], meta: meta };
      }
      case ACT.REMOVE: {
        const loc = _locateCard(st, meta.loc);
        if (!loc || !loc.card) return { scenarios: [factory()], meta: meta };
        meta.oldColor = loc.card.color;
        if (loc.zone === ZONE.MATCH && loc.slot >= 0 && loc.slot < 2) {
          pairColors[loc.slot] = -1;
        } else if (loc.zone === ZONE.IDENTITY) {
          idColors[loc.seat] = -1;
        }
        return { scenarios: [factory()], meta: meta };
      }
      case ACT.FIX:
        // 固定不改变颜色；价值在 _fixScore 里单独评估
        return { scenarios: [factory()], meta: meta };
      default:
        return null;
    }
  }

  // =============================================================
  // 局面评估
  // =============================================================

  /** 该配对色若成功结算，对 seat 的收益（正=自己赚/赢，负=对手赚/赢）。 */
  function _evalResolution(st, pairColors, idColors) {
    if (!pairColors || pairColors.length < 2) return 0;
    const c0 = pairColors[0];
    const c1 = pairColors[1];
    if (c0 < 0 || c1 < 0 || c0 !== c1) return 0;
    const color = c0;
    const gainers = [];
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.personal >= WIN_SCORE) continue;
      if (idColors[p.seat] === color) gainers.push(p);
    }
    if (gainers.length === 0) return 0;

    let myWin = false;
    let oppWin = false;
    let myGain = false;
    let maxGainPersonal = 0;
    for (let i = 0; i < gainers.length; i++) {
      const g = gainers[i];
      if (g.seat === st.seat) {
        myGain = true;
        if (g.personal >= WIN_SCORE - 1) myWin = true;
      } else if (g.personal >= WIN_SCORE - 1) {
        oppWin = true;
      }
      if (g.personal > maxGainPersonal) maxGainPersonal = g.personal;
    }

    if (myWin) {
      return WIN_BONUS * (oppWin ? 0.85 : 1.0) - 0.2 * (gainers.length - 1);
    }
    if (oppWin) return -THREAT_PENALTY * 6.0; // 对手直接获胜
    if (myGain) {
      let v = 4.0;
      if (st.myPersonal >= 3) v += 1.0;
      else if (st.myPersonal >= 2) v += 0.3;
      v -= 0.5 * (gainers.length - 1);
      for (let i = 0; i < gainers.length; i++) {
        const g = gainers[i];
        if (g.seat !== st.seat && g.personal >= 3) v -= 1.2;
      }
      return v;
    }
    let v = -0.35 * gainers.length;
    if (maxGainPersonal >= 3) v -= 2.5;
    else if (maxGainPersonal >= 2) v -= 0.6;
    return v;
  }

  /** 某颜色作为「我的身份颜色」的吸引力（0 起步；越高越值得持有）。 */
  function _colorDesirability(st, color, pairColors) {
    if (color === undefined || color === null || color < 0) return 0;
    const pairs = pairColors || st.pairColors;
    let d = 0.5;
    let cnt = 0;
    if (pairs[0] === color) cnt += 1;
    if (pairs[1] === color) cnt += 1;
    d += cnt * 1.1;
    if (cnt >= 2) d += 1.4;
    // 场上可见的该颜色牌（自己抽牌区 + 对手抽牌区朝上）
    const me = _player(st, st.seat);
    if (me) {
      for (let i = 0; i < me.draw.length; i++) if (me.draw[i].color === color) d += 0.3;
    }
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat === st.seat) continue;
      for (let j = 0; j < p.draw.length; j++) if (p.draw[j].color === color) d += 0.12;
    }
    // 该颜色上的对手威胁：别人快赢时不要给他喂分赛道
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat === st.seat || p.identityColor !== color) continue;
      if (p.personal >= WIN_SCORE - 1 && st.myPersonal < WIN_SCORE - 1) d -= 4.0;
      else if (p.personal >= 3 && st.myPersonal < 3) d -= 1.2;
    }
    return d;
  }

  /** 该颜色是否属于「某个个人分>=4 的对手的身份色」（其配对成功会直接结束对局）。 */
  function _dangerColorForOpp(st, color, excludeSeat) {
    if (color < 0) return false;
    if (st.myPersonal >= WIN_SCORE - 1) return false; // 自己也快赢了，可以一起赢
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat === excludeSeat) continue;
      if (p.identityColor === color && p.personal >= WIN_SCORE - 1) return true;
    }
    return false;
  }

  /** 该颜色形成配对的可能性（用于评估「给对手换一个更不容易配成的颜色」）。 */
  function _colorThreat(st, color) {
    if (color < 0) return 0;
    let v = 0;
    if (st.pairColors[0] === color) v += 1.5;
    if (st.pairColors[1] === color) v += 1.5;
    const me = _player(st, st.seat);
    if (me) {
      for (let i = 0; i < me.draw.length; i++) if (me.draw[i].color === color) v += 0.4;
    }
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat === st.seat) continue;
      for (let j = 0; j < p.draw.length; j++) if (p.draw[j].color === color) v += 0.2;
    }
    if (color === st.myColor) v += 0.5;
    return v;
  }

  /** 把某玩家的身份牌剥离（移走/移除）的价值。 */
  function _stripIdentityValue(st, targetSeat) {
    const p = _player(st, targetSeat);
    if (!p || p.identityColor < 0) return 0;
    let v = 0.8;
    if (p.personal >= WIN_SCORE - 1) v += 22.0;
    else if (p.personal >= 3) v += 5.0;
    else if (p.personal >= 2) v += 1.5;
    if (_dangerColorForOpp(st, p.identityColor, st.seat)) v += 1.5;
    if (st.lateGame) v *= 0.05; // 长局不再执着于拆对手身份
    return v;
  }

  /** 固定对局后（假设颜色不变）的综合价值：配对潜在结算 + 我的身份色吸引力。 */
  function _turnValue(st, pairColors, idColors) {
    let res = _evalResolution(st, pairColors, idColors);
    // 长局防僵局：不再为「阻止别人 +1」而拆对（否则多人 4 分时会永远互拆）。
    if (st.lateGame && res < 0) res = 0;
    // 身份牌不固定时，「我靠身份变色去蹭一个已完成的配对」很容易被对手在下一手翻掉；
    // 尤其是自己差 1 分将获胜时，对手一定会阻止。给这种潜在收益打折，避免原地反复翻身份。
    const meP = _player(st, st.seat);
    const idFixed = meP ? meP.identityFixed : true;
    if (res > 0 && !idFixed) {
      res *= st.myPersonal >= WIN_SCORE - 1 ? 0.08 : 0.6;
    }
    let v = 0.8 * res;
    const myC = idColors[st.seat];
    v += 0.35 * _colorDesirability(st, myC, pairColors);
    if (myC < 0) v -= 3.5;
    if (myC >= 0) {
      let cnt = 0;
      if (pairColors[0] === myC) cnt += 1;
      if (pairColors[1] === myC) cnt += 1;
      if (cnt === 1) v += 1.2; // 已有一张自己的颜色在配牌区
      for (let i = 0; i < 2; i++) {
        const c = pairColors[i];
        if (c >= 0 && _dangerColorForOpp(st, c, st.seat)) v -= 1.2;
      }
    }
    return v;
  }

  /** 身份颜色变化带来的「未来价值」（配对结算后配牌区清空，只有身份色会留下）。 */
  function _identityFutureDelta(st, newIdColors) {
    let v = 0;
    const me = _player(st, st.seat);
    const oldMy = me ? me.identityColor : -1;
    const newMy = newIdColors[st.seat];
    if (newMy !== oldMy) {
      if (oldMy < 0 && newMy >= 0) v += 3.0;
      else if (newMy < 0) v -= 3.0;
      else {
        const emptyPair = [-1, -1];
        v +=
          0.6 *
          (_colorDesirability(st, newMy, emptyPair) - _colorDesirability(st, oldMy, emptyPair));
      }
    }
    for (let i = 0; i < st.players.length; i++) {
      const p = st.players[i];
      if (p.seat === st.seat) continue;
      const oldC = p.identityColor;
      const newC = newIdColors[p.seat];
      if (oldC >= 0 && newC < 0) {
        if (p.personal >= WIN_SCORE - 1) v += st.myPersonal < WIN_SCORE - 1 ? 6.0 : 1.5;
        else if (p.personal >= 3) v += 2.0;
        else v += 0.5;
      } else if (oldC < 0 && newC >= 0) {
        v -= p.personal >= WIN_SCORE - 1 ? 4.0 : 0.5;
      }
    }
    return v;
  }

  /** 估算打出配对后仍能成功结算（两槽同色未被响应破坏）的概率。 */
  function _matchSuccess(st, color, difficulty) {
    const me = _player(st, st.seat);
    if (!me) return 0.2;
    const nOpp = Math.max(1, st.n - 1);
    const pairFixed = !!(st.pair[0] && st.pair[0].fixed) && !!(st.pair[1] && st.pair[1].fixed);
    const idFixed = !!me.identityFixed;
    if (color === st.myColor && me.personal >= WIN_SCORE - 1) {
      // 差 1 分就赢：对手一定会全力阻止（拆对 + 翻/换我的身份牌）
      if (pairFixed && idFixed) return 0.97;
      if (pairFixed) return 0.3;
      if (idFixed) return 0.22;
      return 0.12;
    }
    let p = 0.24;
    let someoneNearWin = false;
    let someoneAt3 = false;
    for (let i = 0; i < st.players.length; i++) {
      const p2 = st.players[i];
      if (p2.seat === st.seat) continue;
      if (p2.personal >= WIN_SCORE - 1) someoneNearWin = true;
      else if (p2.personal >= 3) someoneAt3 = true;
    }
    if (someoneNearWin) p = 0.45;
    else if (someoneAt3) p = 0.33;
    if (color === st.myColor && me.personal >= 3) p = Math.max(p, 0.4);
    if (pairFixed) p *= 0.3;
    let success = Math.pow(1 - p, nOpp);
    if (pairFixed && color === st.myColor && !idFixed) {
      const k = st.k || 4;
      const D = 3 + 2 * (k - 1);
      success *= Math.pow(3 / D, nOpp);
    }
    if (difficulty >= 2) success *= 1.03;
    return clamp(success, 0.04, 0.96);
  }

  // =============================================================
  // 免费动作评分（回合内）
  // =============================================================

  function _freeBonus(st, sim, difficulty) {
    const meta = sim.meta;
    let b = 0;
    if (meta.action === ACT.MOVE || meta.action === ACT.REPLACE) {
      const srcColor = meta.srcColor;
      const from = meta.from;
      const to = meta.to;
      if (to.zone === ZONE.IDENTITY) {
        const target = _player(st, to.seat);
        if (!target) return b;
        if (to.seat === st.seat) {
          if (target.identityColor < 0) b += 3.0; // 补上自己的空身份区，重新获得得分颜色
        } else if (target.identityColor < 0) {
          // 给对手的空身份区填牌：没有好处，还白送颜色
          b -= 2.5 * (target.personal >= 3 ? 1.6 : 1.0);
        } else if (from.zone === ZONE.IDENTITY) {
          if (from.seat !== st.seat) b += _stripIdentityValue(st, from.seat);
        } else {
          // 替换对手的身份牌：至少换成了我抽牌区的一张牌
          b += _stripIdentityValue(st, to.seat) * 0.25;
          b -= _colorThreat(st, srcColor) * 0.5;
          if (srcColor === st.myColor && target.personal >= WIN_SCORE - 1) b -= 2.0;
        }
      } else if (to.zone === ZONE.MATCH) {
        const oldColor = meta.oldColor;
        if (from.zone === ZONE.IDENTITY) {
          if (from.seat === st.seat) b -= 4.0; // 拿自己的身份牌去铺配牌区（身份区会空）
          else b += _stripIdentityValue(st, from.seat);
        }
        if (meta.action === ACT.REPLACE && oldColor >= 0) {
          if (oldColor === st.myColor && srcColor !== st.myColor) b -= 0.7;
          if (_dangerColorForOpp(st, oldColor, st.seat) && srcColor !== oldColor) b += 1.5;
        }
        if (srcColor === st.myColor) b += 0.8;
        if (_dangerColorForOpp(st, srcColor, st.seat)) b -= 1.2;
      }
    } else if (meta.action === ACT.FLIP) {
      const loc = meta.loc;
      if (loc.zone === ZONE.IDENTITY) {
        if (loc.seat === st.seat) {
          // 翻自己的身份：完整地按身份吸引力变化给分（基础价值里只算了 0.35 权重）
          const oldD = _colorDesirability(st, st.myColor, st.pairColors);
          let newD = 0;
          for (let i = 0; i < sim.scenarios.length; i++) {
            const sc = sim.scenarios[i];
            newD += sc.prob * _colorDesirability(st, sc.idColors[st.seat], sc.pairColors);
          }
          b += 0.75 * (newD - oldD);
        } else {
          const opp = _player(st, loc.seat);
          if (opp && opp.personal >= WIN_SCORE - 1) {
            const cur = opp.identityColor;
            const pc = meta.pChange || 0;
            let inPair = 0;
            if (st.pairColors[0] === cur) inPair += 1;
            if (st.pairColors[1] === cur) inPair += 1;
            b += pc * (inPair > 0 ? 26 : 6);
            if (cur === st.myColor && st.myPersonal < WIN_SCORE - 1) b += pc * 3;
          } else if (opp && opp.personal >= 3) {
            const cur2 = opp.identityColor;
            let inPair2 = 0;
            if (st.pairColors[0] === cur2) inPair2 += 1;
            if (st.pairColors[1] === cur2) inPair2 += 1;
            b += (meta.pChange || 0) * (inPair2 > 0 ? 3 : 1.2);
          } else {
            b -= 0.3;
          }
          if (st.lateGame) {
            // 长局不再为了拆对手身份而响应/行动
            b = b > 0 ? b * 0.05 : b;
          }
        }
      } else if (loc.zone === ZONE.DRAW) {
        b -= 0.6; // 翻抽牌区的牌基本是浪费一个回合
      }
    }
    return b;
  }

  function _scoreFreeAction(st, option, difficulty) {
    const sim = _simulate(st, option);
    if (!sim) return -5.0;
    const baseValue = _turnValue(st, st.pairColors, _currentIdColors(st));
    let exp = 0;
    for (let i = 0; i < sim.scenarios.length; i++) {
      const sc = sim.scenarios[i];
      exp += sc.prob * _turnValue(st, sc.pairColors, sc.idColors);
    }
    return exp - baseValue + _freeBonus(st, sim, difficulty);
  }

  // =============================================================
  // 手牌动作评分
  // =============================================================

  function _matchScore(st) {
    if (!st.pairFilled) return -20.0;
    const c0 = st.pairColors[0];
    const c1 = st.pairColors[1];
    if (c0 < 0 || c1 < 0) return -20.0;
    if (c0 !== c1) {
      // 异色配对本来没有收益，还会清空配牌区；但如果两槽都是固定牌而且颜色不同，
      // 就形成「配牌区死锁」：不能再翻/换，只能靠打出配对（或移除）清空。主动解锁。
      if (st.pairFixed) return 1.5;
      // 长局里配牌区长期异色也会拖住对局，清空重新铺垫比无限僵持好。
      if (st.lateGame) return 0.6;
      return -3.0;
    }
    const res = _evalResolution(st, st.pairColors, _currentIdColors(st));
    if (res <= -10.0) return res * 0.5 - 1.0; // 这一配对会让对手直接获胜：绝不打
    // 两槽都是固定牌 = 配牌区被锁死，没人能再翻/换；如果当前结算对我也没好处，
    // 主动打出配对清空它，避免整局卡死在这里。
    if (st.pairFixed && res <= 0) return 3.0;
    const success = _matchSuccess(st, c0, 1);
    let score = success * res + 0.8;
    if (res > 0) score += 0.4; // 兑现已有收益
    return score;
  }

  function _fixScore(st, option) {
    const meta = _parseOption(st, option);
    if (!meta || !meta.loc) return -5.0;
    const loc = _locateCard(st, meta.loc);
    if (!loc) return -5.0;
    if (loc.zone === ZONE.IDENTITY) {
      if (loc.seat === st.seat) {
        let v = 0.7;
        if (st.myPersonal >= WIN_SCORE - 1) v += 7.0;
        else if (st.myPersonal >= 3) v += 3.2;
        else if (st.myPersonal >= 2) v += 1.4;
        if (st.pairSame && st.pairColors[0] === st.myColor) v += 1.0;
        const me = _player(st, st.seat);
        if (me && me.identityOther === me.identityColor) v += 0.6;
        return v;
      }
      // 固定对手的身份牌通常没好处（锁住他们的颜色，也挡住了我们后续操作）
      return -1.5;
    }
    if (loc.zone === ZONE.MATCH) {
      if (st.pairFilled && st.pairSame) {
        const res = _evalResolution(st, st.pairColors, _currentIdColors(st));
        if (res > 0) {
          if (st.myPersonal >= WIN_SCORE - 1 && st.pairColors[0] === st.myColor) return 12.0;
          return Math.min(3.0, res * 0.35);
        }
        if (res < 0) return -3.0; // 别保护对手的得分对
        return 0.4;
      }
      // 单张配牌铺垫不值得固定：固定牌不能再被移动/替换/翻转，反而容易把配牌区锁死
      return -0.8;
    }
    if (loc.zone === ZONE.DRAW) {
      // 抽牌区的固定牌无法被移动/替换/翻转，等于永远用不掉；还会减少回合开始的新牌数。
      // 固定自己的抽牌牌基本是负收益，固定对手的更是白送。
      return -2.0;
    }
    return 0.0;
  }

  function _removeScore(st, option) {
    const meta = _parseOption(st, option);
    if (!meta || !meta.loc) return -5.0;
    const loc = _locateCard(st, meta.loc);
    if (!loc) return -5.0;
    const threatScale = st.lateGame ? 0.05 : 1.0;
    if (loc.zone === ZONE.MATCH) {
      const slot = loc.slot;
      if (slot < 0) return 0.0;
      if (st.pairFilled && st.pairSame) {
        const res = _evalResolution(st, st.pairColors, _currentIdColors(st));
        if (res <= -10.0) return (-res * 0.9 + 2.0) * threatScale; // 拆掉对手直接获胜的配对
        if (res > 0) return -res; // 别拆自己的得分对
        return 0.4;
      }
      let v = 0.5;
      if (loc.card.fixed) {
        // 固定牌锁在配牌区会挡住后续铺垫，必要时用移除解锁
        v += 1.5;
        const otherColor = st.pairColors[1 - slot];
        if (otherColor >= 0 && otherColor === st.myColor && loc.card.color !== st.myColor) v += 1.5;
      }
      if (loc.card.fixed) v += 0.4; // 拆掉锁在配牌区的固定牌，避免配牌区死锁
      if (_dangerColorForOpp(st, loc.card.color, st.seat)) v += 2.0 * threatScale;
      if (
        loc.card.color === st.myColor &&
        st.pairColors[0] !== st.myColor &&
        st.pairColors[1] !== st.myColor
      ) {
        v += 0.2;
      }
      return v;
    }
    if (loc.zone === ZONE.IDENTITY) {
      if (loc.seat === st.seat) return -6.0;
      const p = _player(st, loc.seat);
      if (!p || p.identityColor < 0) return -1.0;
      const inPair = st.pairColors[0] === p.identityColor || st.pairColors[1] === p.identityColor;
      if (p.personal >= WIN_SCORE - 1) return (26.0 + (inPair ? 5.0 : 0.0)) * threatScale;
      if (p.personal >= 3) return (4.0 + (inPair ? 2.0 : 0.0)) * threatScale;
      let v = 0.7;
      if (_dangerColorForOpp(st, p.identityColor, st.seat)) v += 1.0 * threatScale;
      if (p.identityColor === st.myColor) v -= 0.6; // 同色玩家拿到分也连带我们，不必拆
      return v;
    }
    if (loc.zone === ZONE.DRAW) {
      if (loc.seat === st.seat) return -4.0;
      const p = _player(st, loc.seat);
      let v = 0.15;
      if (p) {
        if (p.personal >= 2 && loc.card.color === p.identityColor) v += 0.8;
        if (p.personal >= WIN_SCORE - 1 && loc.card.color === p.identityColor) v += 1.5 * threatScale;
      }
      if (_dangerColorForOpp(st, loc.card.color, st.seat)) v += 0.5 * threatScale;
      return v;
    }
    return 0.0;
  }

  function _scorePlayAction(st, option, difficulty) {
    const action = dint(option, "action", -1);
    if (action === ACT.MATCH) return _matchScore(st) - HAND_COST;
    if (action === ACT.FIX) return _fixScore(st, option) - HAND_COST;
    if (action === ACT.REMOVE) return _removeScore(st, option) - HAND_COST;
    // 新规则手牌里不含 MOVE/REPLACE/FLIP；若出现则按免费动作评估后加成本
    const sim = _simulate(st, option);
    if (!sim) return -5.0;
    return _scoreFreeAction(st, option, difficulty) - HAND_COST;
  }

  // =============================================================
  // 确定性随机（难度 0）
  // =============================================================

  function _state_rng(game, seat, snap) {
    let seedVal = 0;
    const cfg = is_dict(dget(game, "config", null)) ? game.config : {};
    seedVal += dint(cfg, "seed", 0) * SEED_MUL + to_int(seat) * SEED_SEAT;
    if (snap) {
      seedVal += dint(snap, "round", 0) * SEED_ROUND;
      seedVal += dint(snap, "phase", 0) * 131 + dint(snap, "turn_seat", 0) * 17;
      const match = as_array(dget(snap, "match", []));
      for (let i = 0; i < match.length; i++) {
        const c = match[i];
        if (c && is_dict(c)) {
          seedVal += (dint(c, "uid", 0) + 1) * (i + 1) * 31 + dint(c, "color", 0) * 7;
        }
      }
      const players = as_array(dget(snap, "players", []));
      for (let i = 0; i < players.length; i++) {
        const p = players[i];
        seedVal += (dint(p, "personal", 0) + 1) * (i + 3) * 13;
        const idc = dget(p, "identity", null);
        if (idc && is_dict(idc)) {
          seedVal += (dint(idc, "uid", 0) + 1) * 11 + dint(idc, "color", 0) * 3;
        }
        const draw = as_array(dget(p, "draw", []));
        for (let j = 0; j < draw.length; j++) seedVal += (dint(draw[j], "uid", 0) + 1) * 5;
        const hand = as_array(dget(p, "hand", []));
        for (let j = 0; j < hand.length; j++) seedVal += (to_int(hand[j]) + 1) * 2;
      }
    }
    seedVal = seedVal % 2147483647;
    const KKRNG = global.KKRNG;
    if (typeof KKRNG === "function") {
      const rng = new KKRNG(0);
      rng.seed = seedVal;
      return rng;
    }
    // 兜底：xorshift32（defs.js 缺失时也不会抛错）
    let s = seedVal >>> 0;
    if (s === 0) s = 2463534242;
    return {
      randi_range: function (a, b) {
        s ^= s << 13;
        s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5;
        s >>>= 0;
        const span = b - a + 1;
        if (span <= 1) return a;
        return a + (s % span);
      },
    };
  }

  // =============================================================
  // 兜底选择
  // =============================================================

  function _fallbackTurn(free, plays) {
    if (free.length > 0) return { kind: "free", option: free[0] };
    if (plays.length > 0) return { kind: "play", option: plays[0] };
    return {};
  }

  function _randomTurn(game, seat, snap, free, plays) {
    const choices = [];
    for (let i = 0; i < free.length; i++) choices.push({ kind: "free", option: free[i] });
    for (let i = 0; i < plays.length; i++) choices.push({ kind: "play", option: plays[i] });
    if (choices.length === 0) return {};
    const rng = _state_rng(game, seat, snap);
    return choices[rng.randi_range(0, choices.length - 1)];
  }

  // =============================================================
  // KKAI
  // =============================================================

  const KKAI = {
    // 常量公开（便于测试/调参核对）
    _SEED_MUL: SEED_MUL,
    _SEED_SEAT: SEED_SEAT,
    _SEED_ROUND: SEED_ROUND,
    _THREAT_PENALTY: THREAT_PENALTY,
    _WIN_BONUS: WIN_BONUS,
    LATE_GAME_ROUND: LATE_GAME_ROUND,
    _HAND_COST: HAND_COST,

    /**
     * 选择本回合行动。
     * 返回 {kind:"free", option} / {kind:"play", option} / {}。
     */
    choose_turn_action: function (game, seat, difficulty) {
      const diff = _normDifficulty(difficulty);
      const free = _getFreeActions(game, seat);
      const plays = _getLegalActions(game, seat);
      if (free.length === 0 && plays.length === 0) return {};
      const snap = _getSnapshot(game, seat);
      if (diff <= 0) return _randomTurn(game, seat, snap, free, plays);
      if (!snap) return _fallbackTurn(free, plays);

      let st = null;
      try {
        st = _buildState(snap, seat);
      } catch (err) {
        st = null;
      }
      if (!st) return _fallbackTurn(free, plays);
      seat = to_int(seat);

      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < free.length; i++) {
        const option = free[i];
        let score;
        try {
          score = _scoreFreeAction(st, option, diff);
        } catch (err2) {
          score = -5.0;
        }
        if (score > bestScore) {
          bestScore = score;
          best = { kind: "free", option: option };
        }
      }
      for (let i = 0; i < plays.length; i++) {
        const option = plays[i];
        let score;
        try {
          score = _scorePlayAction(st, option, diff);
        } catch (err3) {
          score = -5.0;
        }
        if (score > bestScore) {
          bestScore = score;
          best = { kind: "play", option: option };
        }
      }
      if (!best) return _fallbackTurn(free, plays);
      return best;
    },

    /**
     * 选择响应窗口的行为。
     * 返回 {respond:true, option} 或 {respond:false}。
     */
    choose_response: function (game, seat, difficulty) {
      const diff = _normDifficulty(difficulty);
      const options = _getResponseOptions(game, seat);
      if (options.length === 0) return { respond: false };
      const snap = _getSnapshot(game, seat);
      if (diff <= 0) {
        const rng = _state_rng(game, seat, snap);
        if (rng.randi_range(0, 1) === 0) return { respond: false };
        return { respond: true, option: options[rng.randi_range(0, options.length - 1)] };
      }
      if (!snap) return { respond: false };

      let st = null;
      try {
        st = _buildState(snap, seat);
      } catch (err) {
        st = null;
      }
      if (!st) return { respond: false };
      seat = to_int(seat);

      const currentRes0 = _evalResolution(st, st.pairColors, _currentIdColors(st));
      // 长局防僵局：不再破坏别人的 +1（否则多人 3~4 分时会互相拆对到死）。
      const currentRes = st.lateGame ? Math.max(0, currentRes0) : currentRes0;
      const futureWeight = diff >= 2 ? 0.55 : 0.35;
      let bestOption = null;
      let bestDelta = -Infinity;
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        let sim = null;
        try {
          sim = _simulate(st, option);
        } catch (err2) {
          sim = null;
        }
        if (!sim) continue;
        let expRes = 0;
        let expFuture = 0;
        for (let j = 0; j < sim.scenarios.length; j++) {
          const sc = sim.scenarios[j];
          let res = _evalResolution(st, sc.pairColors, sc.idColors);
          if (st.lateGame && res < 0) res = 0;
          expRes += sc.prob * res;
          expFuture += sc.prob * _identityFutureDelta(st, sc.idColors);
        }
        const delta = expRes - currentRes + expFuture * futureWeight;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestOption = option;
        }
      }
      // 只有明显改善局面才响应；避免无意义的翻牌/拆对拖长对局。
      const threshold = diff >= 2 ? 1.0 : 1.8;
      if (bestOption && bestDelta > threshold) {
        return { respond: true, option: bestOption };
      }
      return { respond: false };
    },
  };

  global.KKAI = KKAI;
})(typeof window !== "undefined" ? window : globalThis);
