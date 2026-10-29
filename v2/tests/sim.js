"use strict";
/* v2 AI 全自动模拟：检查引擎/规则能否正常完成对局与统计。 */
const path = require("node:path");
const { Game, PHASES, WIN_SCORE } = require(path.join(__dirname, "..", "js", "v2-engine.js"));
const AI = require(path.join(__dirname, "..", "js", "v2-ai.js"));

function playOne(players, colors, seed) {
  const g = new Game({ player_count: players, color_count: colors, seed, all_ai: true });
  let steps = 0;
  let guard = 0;
  while (!g.gameOver && guard++ < 20000) {
    if (g.phase === PHASES.ARRANGE) {
      const opt = AI.arrange(g);
      if (!opt) throw new Error("no arrange option");
      const r = g.arrange(opt);
      if (!r.ok) throw new Error("arrange failed: " + r.error);
    } else if (g.phase === PHASES.RESPONSE) {
      const r = g.currentResponder();
      if (r < 0) throw new Error("response with no responder");
      const opt = AI.chooseResponse(g);
      if (!opt) throw new Error("no response option");
      const rr = g.performResponse(opt);
      if (!rr.ok) throw new Error("response failed: " + rr.error);
    } else if (g.phase === PHASES.FINAL) {
      const opt = AI.chooseFinal(g);
      if (!opt) throw new Error("no final option");
      const rr = g.performFinal(opt);
      if (!rr.ok) throw new Error("final failed: " + rr.error);
      const res = g.resolve();
      if (!res.ok) throw new Error("resolve failed: " + res.error);
    } else if (g.phase === PHASES.REVEAL) {
      g.nextTurn();
    } else if (g.phase === PHASES.OVER) {
      break;
    } else {
      throw new Error("unknown phase " + g.phase);
    }
    steps += 1;
  }
  return { over: g.gameOver, steps, round: g.round, scores: g.players.map((p) => p.score), winners: g.winners.slice() };
}

let total = 0, done = 0, fail = 0;
const rounds = [];
const winners = [0, 0, 0, 0];
const scoreDist = {};
for (const players of [2, 3, 4]) {
  for (const colors of [2, 3, 4]) {
    for (let i = 0; i < 20; i++) {
      total += 1;
      const seed = players * 100000 + colors * 1000 + i * 97 + 7;
      try {
        const r = playOne(players, colors, seed);
        if (r.over) {
          done += 1;
          rounds.push(r.round);
          winners[r.winners.length] = (winners[r.winners.length] || 0) + 1;
          const key = r.scores.join(",");
          scoreDist[key] = (scoreDist[key] || 0) + 1;
        } else fail += 1;
      } catch (e) {
        fail += 1;
        console.error("FAIL", players, colors, seed, e.message);
        if (fail > 5) break;
      }
    }
  }
}
rounds.sort((a, b) => a - b);
console.log("games", total, "done", done, "fail", fail);
console.log("avg rounds", (rounds.reduce((a, b) => a + b, 0) / Math.max(1, rounds.length)).toFixed(1), "P90", rounds[Math.floor(rounds.length * 0.9)], "max", rounds[rounds.length - 1]);
console.log("winners count", winners);
console.log("score dist example", Object.keys(scoreDist).slice(0, 10).map((k) => k + "×" + scoreDist[k]).join(" | "));
