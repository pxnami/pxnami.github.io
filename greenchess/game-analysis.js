const ANALYSIS_DEPTH = 14;
const BOOK_MOVE_LIMIT = 6; // first N ply per side treated leniently as opening theory

function cpFromScore(score, whiteToMove) {
  // Normalizes a Stockfish score object to centipawns from White's
  // perspective. Mate scores are mapped to large but finite values so
  // they still sort/compare correctly against centipawn evals.
  if (!score) return 0;
  let value;
  if (score.type === "mate") {
    const sign = score.value > 0 ? 1 : -1;
    value = sign * (100000 - Math.abs(score.value) * 100);
  } else {
    value = score.value;
  }
  // Stockfish reports the score from the perspective of the side to move
  // in the position it was given. Convert to White's perspective.
  return whiteToMove ? value : -value;
}

function classifyMove({ cpLossForMover, isBookPhase, wasOnlyLegalGoodMove, sameAsEngineBest, sacrificedMaterial, evalAfterForMover }) {
  if (isBookPhase && cpLossForMover < 40) return "book";

  if (sameAsEngineBest) {
    if (sacrificedMaterial && evalAfterForMover > 150) return "brilliant";
    return "best";
  }

  if (cpLossForMover < 10) return "best";
  if (cpLossForMover < 25) return "great";
  if (cpLossForMover < 50) return "good";
  if (cpLossForMover < 120) return "inaccuracy";
  if (cpLossForMover < 300) return "mistake";
  return "blunder";
}

const COACH_TEMPLATES = {
  brilliant: [
    "A brilliant find — this sacrifice looks risky but the engine confirms it's the strongest move on the board.",
    "Excellent! You spotted a move most players would miss, and it holds up under deep calculation.",
  ],
  best: [
    "The engine's top choice. Well played.",
    "This is exactly what a strong engine would play here.",
  ],
  great: [
    "A great move — very close to the engine's preference and keeps your position healthy.",
    "Strong choice, only a hair off the computer's top line.",
  ],
  good: [
    "A solid, reasonable move. Nothing wrong here, though there was a slightly more precise option.",
    "Good move — keeps the position stable without giving anything away.",
  ],
  book: [
    "A well-known opening move. Following established theory here.",
    "Standard opening theory — a safe and principled choice.",
  ],
  inaccuracy: [
    "A small inaccuracy. It doesn't lose material, but it gives your opponent a slightly easier game.",
    "Not the most precise move — the engine finds something a bit stronger.",
  ],
  mistake: [
    "This is a mistake. It hands your opponent a clear advantage they didn't have before.",
    "A real mistake here — the position swings noticeably against you.",
  ],
  blunder: [
    "This is a blunder. It significantly worsens your position — likely loses material or walks into a tactic.",
    "A serious blunder. The evaluation swings sharply here — watch for hanging pieces or missed tactics.",
  ],
};

function coachTextFor(classification, cpLossForMover, bestMoveReadable) {
  const options = COACH_TEMPLATES[classification] || COACH_TEMPLATES.good;
  const base = options[Math.floor(Math.random() * options.length)];
  if ((classification === "mistake" || classification === "blunder" || classification === "inaccuracy") && bestMoveReadable) {
    return `${base} The engine preferred ${bestMoveReadable} instead.`;
  }
  return base;
}

// Rough Elo estimate from average centipawn loss (ACPL), calibrated to
// land roughly in chess.com's accuracy/rating ranges. This is a heuristic,
// not a certified rating.
function estimateElo(acpl) {
  if (acpl <= 5) return 2600;
  if (acpl <= 10) return 2400;
  if (acpl <= 20) return 2200;
  if (acpl <= 35) return 2000;
  if (acpl <= 55) return 1800;
  if (acpl <= 80) return 1600;
  if (acpl <= 110) return 1400;
  if (acpl <= 150) return 1200;
  if (acpl <= 200) return 1000;
  if (acpl <= 260) return 800;
  if (acpl <= 340) return 600;
  return 400;
}

function accuracyFromACPL(acpl) {
  // Approximation of chess.com-style accuracy percentage from ACPL.
  const acc = 103.1668 * Math.exp(-0.04354 * acpl) - 3.1668;
  return Math.max(0, Math.min(100, Math.round(acc * 10) / 10));
}

function readableSquare(uciMove) {
  if (!uciMove) return null;
  const files = "abcdefgh";
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  return `${from}-${to}`;
}

async function analyzeGame(history, onProgress) {
  const engine = new StockfishClient();
  await engine.waitReady();

  const boards = replayBoards(history);
  const moveReports = [];
  const cpLossBySide = { w: [], b: [] };

  for (let i = 0; i < history.length; i++) {
    const boardBefore = boards[i];
    const boardAfter = boards[i + 1];
    const whiteToMove = i % 2 === 0;
    const move = history[i];

    const fenBefore = boardToFEN(boardBefore, whiteToMove);
    const fenAfter = boardToFEN(boardAfter, !whiteToMove);

    const bestFromBefore = await engine.analyze(fenBefore, ANALYSIS_DEPTH);
    const evalAfterPlayed = await engine.analyze(fenAfter, ANALYSIS_DEPTH);

    const bestCpWhite = cpFromScore(bestFromBefore.score, whiteToMove);
    // evalAfterPlayed.score is reported from the perspective of the side to
    // move in fenAfter (the opponent of whoever just moved); normalize to
    // White's perspective for a consistent comparison baseline.
    const afterCpWhiteNormalized = cpFromScore(evalAfterPlayed.score, !whiteToMove);

    const bestForMover = whiteToMove ? bestCpWhite : -bestCpWhite;
    const afterForMover = whiteToMove ? afterCpWhiteNormalized : -afterCpWhiteNormalized;

    const cpLossForMover = Math.max(0, Math.round(bestForMover - afterForMover));

    const playedUCI = moveToUCI(move.fromR, move.fromC, move.toR, move.toC, move.promotion);
    const sameAsEngineBest = bestFromBefore.bestMove === playedUCI;

    const capturedPiece = boardBefore[move.toR][move.toC];
    const sacrificedMaterial = !!capturedPiece; // simplistic heuristic

    const isBookPhase = i < BOOK_MOVE_LIMIT * 2;

    const classification = classifyMove({
      cpLossForMover,
      isBookPhase,
      sameAsEngineBest,
      sacrificedMaterial,
      evalAfterForMover: afterForMover,
    });

    const bestMoveReadable = readableSquare(bestFromBefore.bestMove);
    const coachText = coachTextFor(classification, cpLossForMover, bestMoveReadable);

    moveReports.push({
      ply: i,
      mover: whiteToMove ? "w" : "b",
      fromR: move.fromR,
      fromC: move.fromC,
      toR: move.toR,
      toC: move.toC,
      promotion: move.promotion,
      evalAfterWhitePerspective: afterCpWhiteNormalized,
      cpLoss: cpLossForMover,
      classification,
      bestMoveUCI: bestFromBefore.bestMove,
      coachText,
      fenAfter,
    });

    cpLossBySide[whiteToMove ? "w" : "b"].push(cpLossForMover);

    if (onProgress) onProgress(i + 1, history.length);
  }

  engine.destroy();

  const acplW = cpLossBySide.w.length
    ? Math.round(cpLossBySide.w.reduce((a, b) => a + b, 0) / cpLossBySide.w.length)
    : 0;
  const acplB = cpLossBySide.b.length
    ? Math.round(cpLossBySide.b.reduce((a, b) => a + b, 0) / cpLossBySide.b.length)
    : 0;

  const summary = {
    w: { blunder: 0, mistake: 0, inaccuracy: 0, good: 0, great: 0, best: 0, brilliant: 0, book: 0 },
    b: { blunder: 0, mistake: 0, inaccuracy: 0, good: 0, great: 0, best: 0, brilliant: 0, book: 0 },
  };
  for (const m of moveReports) {
    summary[m.mover][m.classification]++;
  }

  return {
    moves: moveReports,
    boards,
    summary,
    rating: {
      w: { acpl: acplW, elo: estimateElo(acplW), accuracy: accuracyFromACPL(acplW) },
      b: { acpl: acplB, elo: estimateElo(acplB), accuracy: accuracyFromACPL(acplB) },
    },
  };
}
