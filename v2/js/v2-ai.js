/* v2 AI：只用公开信息 + 自己的暗牌；简单启发式，能正常完成对局。 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.V2AI = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SLOT = { SLOT: "slot", BACKUP: "backup" };

  function color(card) { return card ? card.color() : -1; }

  function ownColors(player) {
    return { slot: color(player.slot), backup: color(player.backup) };
  }

  function pairValue(player) {
    var c = ownColors(player);
    if (c.slot < 0 || c.backup < 0) return 0;
    return c.slot === c.backup ? 100 : 0;
  }

  function arrange(game) {
    var options = game.arrangeOptions();
    if (!options.length) return null;
    var best = null;
    var bestScore = -1e9;
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      var val = 0;
      if (o.slotColor === o.backupColor) val += 100;
      // 公开槽位尽量放自己更想保留的颜色；简单：同色时把同色放配牌槽（公开）或备牌位都可
      val += Math.random() * 0.01;
      if (val > bestScore) { bestScore = val; best = o; }
    }
    return best;
  }

  /** 自己两张牌交换后能否同色（只用自己知道的牌 + 目标公开牌）。 */
  function evaluateOwnExchange(game, me, ownRef, otherSeat, targetRef) {
    var other = game.players[otherSeat];
    var targetCard = targetRef === SLOT.SLOT ? other.slot : other.backup;
    if (!targetCard) return -1;
    // 对手备牌位未知：AI 不利用隐藏信息
    if (otherSeat !== me.seat && targetRef === SLOT.BACKUP) return -1;
    var newSlot = me.slot;
    var newBackup = me.backup;
    var own = ownRef === SLOT.SLOT ? me.slot : me.backup;
    if (!own) return -1;
    if (ownRef === SLOT.SLOT) newSlot = targetCard; else newBackup = targetCard;
    var c1 = color(newSlot);
    var c2 = color(newBackup);
    var val = c1 >= 0 && c2 >= 0 && c1 === c2 ? 100 : 0;
    if (otherSeat !== me.seat) {
      var otherTargetNew = own; // 对方得到我的牌，可能帮助对方；简单不评估
      val += 0;
    }
    return val;
  }

  function chooseResponse(game) {
    var opts = game.responseOptions();
    if (!opts.length) return null;
    var r = game.currentResponder();
    var me = game.players[r];
    var active = game.activePlayer();
    var best = null;
    var bestScore = -1e9;
    var activeNearWin = active.score >= 4;
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var val = 0;
      if (o.kind === "exchange") {
        var ownRef = o.ownRef;
        // 只考虑用自己牌换对方公开的配牌槽；对方备牌位暗置，不利用隐藏信息
        if (o.targetRef === SLOT.BACKUP) { val = -50; }
        else {
          var own = ownRef === SLOT.SLOT ? me.slot : me.backup;
          var incoming = active.slot;
          var newSlot = ownRef === SLOT.SLOT ? incoming : me.slot;
          var newBackup = ownRef === SLOT.BACKUP ? incoming : me.backup;
          var same = newSlot && newBackup && newSlot.color() === newBackup.color();
          val = same ? 80 : 0;
          if (activeNearWin) val += 20; // 换走对方公开牌，有干扰价值
        }
      } else if (o.kind === "flip") {
        // 翻对方牌是盲翻；对手接近胜利时更有价值
        val = activeNearWin ? 25 : 2;
      } else {
        val = 0;
      }
      // 小随机避免完全固定
      val += Math.random() * 0.1;
      if (val > bestScore) { bestScore = val; best = o; }
    }
    return best;
  }

  function chooseFinal(game) {
    var opts = game.finalOptions();
    if (!opts.length) return null;
    var me = game.activePlayer();
    var best = null;
    var bestScore = -1e9;
    var current = pairValue(me);
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i];
      var val = 0;
      if (o.kind === "pass") {
        val = current; // 已经同色就不动
      } else if (o.kind === "flip") {
        var card = o.ownRef === SLOT.SLOT ? me.slot : me.backup;
        if (card) {
          var otherCard = o.ownRef === SLOT.SLOT ? me.backup : me.slot;
          var nc = card.sides[1 - card.up];
          if (otherCard && nc === otherCard.color()) val = 100;
          else val = 0;
        }
      } else if (o.kind === "exchange") {
        var other = game.players[o.targetSeat];
        // 只考虑换对方公开配牌槽，避免利用暗牌信息
        if (o.targetRef === SLOT.SLOT && other) {
          var incoming = other.slot;
          var mine = o.ownRef === SLOT.SLOT ? me.slot : me.backup;
          var newSlot = o.ownRef === SLOT.SLOT ? incoming : me.slot;
          var newBackup = o.ownRef === SLOT.BACKUP ? incoming : me.backup;
          if (newSlot && newBackup && newSlot.color() === newBackup.color()) val = 80;
          else if (incoming && mine) val = 1;
        } else {
          val = -50;
        }
      }
      val += Math.random() * 0.1;
      if (val > bestScore) { bestScore = val; best = o; }
    }
    if (best && best.kind !== "pass" && bestScore < current) return opts.find(function (o) { return o.kind === "pass"; }) || best;
    return best;
  }

  return { arrange: arrange, chooseResponse: chooseResponse, chooseFinal: chooseFinal, pairValue: pairValue };
});
