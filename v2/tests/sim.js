"use strict";
/* v2 新规则模拟：10 张手牌 / 正负牌区 / 5 轮 / 每人最多 2 次响应 */
const path = require("node:path");
const { Game, PHASES } = require(path.join(__dirname, "..", "js", "v2-engine.js"));
const AI = require(path.join(__dirname, "..", "js", "v2-ai.js"));

function playOne(players, colors, seed) {
  const g = new Game({ player_count: players, color_count: colors, seed, all_ai: true });
  let steps = 0;
  while (!g.gameOver && steps < 2000) {
    if (g.phase === PHASES.PLACE_POS || g.phase === PHASES.PLACE_NEG) {
      const seat = g.currentPlacer();
      if (seat < 0) throw new Error("placement with no placer");
      const idx = AI.choosePlacement(g);
      const r = g.placeCard(idx);
      if (!r.ok) throw new Error("place failed: " + r.error);
    } else if (g.phase === PHASES.RESPONSE) {
      const r = g.currentResponder();
      if (r < 0) throw new Error("response with no responder");
      const opt = AI.chooseResponse(g);
      const rr = g.performResponse(opt);
      if (!rr.ok) throw new Error("response failed: " + rr.error);
    } else if (g.phase === PHASES.REVEAL) {
      g.nextRound();
    } else if (g.phase === PHASES.OVER) {
      break;
    } else {
      throw new Error("unknown phase " + g.phase);
    }
    steps += 1;
  }
  return {
    over: g.gameOver,
    steps,
    scores: g.players.map((p) => p.score),
    winners: g.winners.slice(),
    used: g.players.map((p) => p.totalResponseUsed || 0),
  };
}

let total = 0, done = 0, fail = 0;
const scores = [];
const winnerCounts = {};
const tieCount = { games: 0, ties: 0 };
const scoreHistogram = {};
for (const players of [2, 3, 4]) {
  for (const colors of [2, 3, 4]) {
    for (let i = 0; i < 20; i++) {
      total += 1;
      const seed = players * 100000 + colors * 1000 + i * 97 + 7;
      try {
        const r = playOne(players, colors, seed);
        if (!r.over) { fail += 1; continue; }
        done += 1;
        scores.push(r.scores.reduce((a, b) => a + b, 0) / r.scores.length);
        const w = r.winners.length;
        winnerCounts[w] = (winnerCounts[w] || 0) + 1;
        if (w > 1) { tieCount.ties += 1; }
        tieCount.games += 1;
        const key = r.scores.join(",");
        scoreHistogram[key] = (scoreHistogram[key] || 0) + 1;
      } catch (e) {
        fail += 1;
        console.error("FAIL", players, colors, seed, e.message);
        if (fail > 5) break;
      }
    }
  }
}
scores.sort((a, b) => a - b);
console.log("games", total, "done", done, "fail", fail);
console.log("avg total score", (scores.reduce((a, b) => a + b, 0) / Math.max(1, scores.length)).toFixed(2), "min", scores[0], "max", scores[scores.length - 1]);
console.log("winners count", winnerCounts);
console.log("tie rate", ((100 * tieCount.ties) / Math.max(1, tieCount.games)).toFixed(1) + "%");
const top = Object.keys(scoreHistogram).sort((a, b) => scoreHistogram[b] - scoreHistogram[a]).slice(0, 8);
console.log("common scores:", top.map((k) => k + "×" + scoreHistogram[k]).join(" | "));
