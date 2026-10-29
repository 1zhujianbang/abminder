/* v2 AI：10 张手牌 / 正负牌区 / 5 轮。简单启发式，只使用自己知道的牌与公开信息。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.V2AI = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function ownMatch(p) {
    if (!p.pos || !p.neg) return false;
    return p.pos.color() === p.neg.down();
  }

  function choosePlacement(game) {
    var seat = game.currentPlacer();
    if (seat < 0) return 0;
    var p = game.players[seat];
    var hand = p.hand;
    if (!hand.length) return 0;
    if (game.phase === "place_pos") {
      var best = 0;
      var bestScore = -1;
      for (var i = 0; i < hand.length; i++) {
        var front = hand[i].sides[0];
        var score = 0;
        for (var j = 0; j < hand.length; j++) {
          if (i === j) continue;
          if (hand[j].sides[1] === front) score += 1;
        }
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    }
    var target = p.pos ? p.pos.color() : -1;
    for (var k = 0; k < hand.length; k++) {
      if (hand[k].sides[1] === target) return k;
    }
    var best2 = 0;
    var score2 = -1;
    for (var a = 0; a < hand.length; a++) {
      var back = hand[a].sides[1];
      var s = 0;
      for (var b = 0; b < hand.length; b++) {
        if (a === b) continue;
        if (hand[b].sides[0] === back) s += 1;
      }
      if (s > score2) { score2 = s; best2 = a; }
    }
    return best2;
  }

  function cardByDesc(game, d) {
    var p = game.players[d.seat];
    if (!p) return null;
    if (d.zone === "pos") return p.pos;
    if (d.zone === "neg") return p.neg;
    if (d.zone === "hand") return p.hand[d.index] || null;
    return null;
  }

  function ownMatchAfter(game, option) {
    var seat = game.currentResponder();
    var p = game.players[seat];
    if (!p || !p.pos || !p.neg) return false;
    var pos = p.pos;
    var neg = p.neg;
    if (option.kind === "flip") {
      var t = option.target;
      if (!t || t.seat !== seat) return ownMatch(p);
      var card = cardByDesc(game, t);
      if (!card) return ownMatch(p);
      var flippedUp = 1 - card.up;
      if (t.zone === "pos") return card.sides[flippedUp] === neg.down();
      if (t.zone === "neg") return pos.color() === card.sides[1 - flippedUp];
      return ownMatch(p);
    }
    if (option.kind === "replace") {
      var a = option.a, b = option.b;
      if (!a || !b) return ownMatch(p);
      if (b.seat !== seat || a.seat !== seat) return ownMatch(p);
      var ca = cardByDesc(game, a);
      var cb = cardByDesc(game, b);
      if (!ca || !cb) return ownMatch(p);
      var newPos = pos;
      var newNeg = neg;
      if (a.zone === "pos") newPos = cb;
      if (a.zone === "neg") newNeg = cb;
      if (b.zone === "pos") newPos = ca;
      if (b.zone === "neg") newNeg = ca;
      if (!newPos || !newNeg) return false;
      return newPos.color() === newNeg.down();
    }
    return ownMatch(p);
  }

  function leaderSeat(game) {
    var best = -1, bestScore = -1;
    for (var i = 0; i < game.players.length; i++) {
      if (game.players[i].score > bestScore) { bestScore = game.players[i].score; best = i; }
    }
    return { seat: best, score: bestScore };
  }

  function attackValue(game, seat, option, leader) {
    var targetSeat = -1;
    if (option.kind === "flip" && option.target && option.target.seat !== seat) targetSeat = option.target.seat;
    else if (option.kind === "replace" && option.b && option.b.seat !== seat) targetSeat = option.b.seat;
    if (targetSeat < 0) return 0;
    var opp = game.players[targetSeat];
    if (!opp || !opp.pos || !opp.neg) return 0;
    var newDown = -1;
    if (option.kind === "flip") {
      var tc = cardByDesc(game, option.target);
      if (!tc) return 0;
      // 翻转后，朝下面 = 翻转前朝上面
      newDown = tc.sides[tc.up];
    } else {
      var a = cardByDesc(game, option.a);
      if (!a) return 0;
      newDown = a.down();
      if (option.a.zone !== "hand") return -8; // 会动到自己牌区，风险高
    }
    var posColor = opp.pos.color();
    var val = newDown !== posColor ? 28 : -25;
    if (targetSeat === leader.seat) val += 22;
    return val;
  }

  function chooseResponse(game) {
    var opts = game.responseOptions();
    if (!opts.length) return { kind: "pass" };
    var seat = game.currentResponder();
    var me = game.players[seat];
    var leader = leaderSeat(game);
    var already = ownMatch(me);
    var best = null;
    var bestValue = -1e9;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var val = 0;
      if (o.kind === "pass") {
        val = already ? 50 : 0;
      } else {
        var after = ownMatchAfter(game, o);
        if (after && !already) val = 100;
        else if (after && already) val = 55;
        else if (!after && already) val = -20;
        else val = 0;
        val += attackValue(game, seat, o, leader);
        if (o.kind === "flip" && o.target && o.target.zone === "hand" && !after) val += 1;
      }
      if (val > bestValue) { bestValue = val; best = o; }
    }
    if (!best) return { kind: "pass" };
    if (already && bestValue < 50) {
      for (var k = 0; k < opts.length; k++) if (opts[k].kind === "pass") return opts[k];
    }
    return best;
  }

  return { choosePlacement: choosePlacement, chooseResponse: chooseResponse };
});
