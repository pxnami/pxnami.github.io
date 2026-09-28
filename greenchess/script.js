const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function isWhite(p) { return !!p && p === p.toUpperCase(); }
function isBlack(p) { return !!p && p === p.toLowerCase(); }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function cloneBoard(b) { return b.map((row) => row.slice()); }

// Client-side move generation mirrors server/chessEngine.js so the board can
// highlight legal squares (including castling and en passant) before the
// server confirms a move. The server remains the source of truth for what
// actually happens; this is UI-only.

function rawMovesClient(board, r, c, ctx) {
  const p = board[r][c];
  if (!p) return [];
  const white = isWhite(p);
  const enemy = white ? isBlack : isWhite;
  const type = p.toLowerCase();
  const moves = [];
  const castling = (ctx && ctx.castling) || {};
  const enPassant = ctx && ctx.enPassant;

  function slide(dirs) {
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        if (!board[nr][nc]) {
          moves.push({ r: nr, c: nc, flag: null });
        } else {
          if (enemy(board[nr][nc])) moves.push({ r: nr, c: nc, flag: null });
          break;
        }
        nr += dr; nc += dc;
      }
    }
  }

  if (type === "p") {
    const dir = white ? -1 : 1;
    const startRow = white ? 6 : 1;
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push({ r: r + dir, c, flag: null });
      if (r === startRow && !board[r + 2 * dir][c]) moves.push({ r: r + 2 * dir, c, flag: "double" });
    }
    for (const dc of [-1, 1]) {
      const nr = r + dir, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      if (board[nr][nc] && enemy(board[nr][nc])) {
        moves.push({ r: nr, c: nc, flag: null });
      } else if (enPassant && enPassant.r === nr && enPassant.c === nc) {
        moves.push({ r: nr, c: nc, flag: "ep" });
      }
    }
  } else if (type === "n") {
    const deltas = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
    for (const [dr, dc] of deltas) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc) && (!board[nr][nc] || enemy(board[nr][nc]))) moves.push({ r: nr, c: nc, flag: null });
    }
  } else if (type === "b") {
    slide([[1, 1], [1, -1], [-1, 1], [-1, -1]]);
  } else if (type === "r") {
    slide([[1, 0], [-1, 0], [0, 1], [0, -1]]);
  } else if (type === "q") {
    slide([[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]);
  } else if (type === "k") {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && (!board[nr][nc] || enemy(board[nr][nc]))) moves.push({ r: nr, c: nc, flag: null });
      }
    }
    const homeRow = white ? 7 : 0;
    if (r === homeRow && c === 4) {
      const kSide = white ? castling.wK : castling.bK;
      const qSide = white ? castling.wQ : castling.bQ;
      if (kSide && !board[homeRow][5] && !board[homeRow][6] && board[homeRow][7] === (white ? "R" : "r")) {
        moves.push({ r: homeRow, c: 6, flag: "castleK" });
      }
      if (qSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1] && board[homeRow][0] === (white ? "R" : "r")) {
        moves.push({ r: homeRow, c: 2, flag: "castleQ" });
      }
    }
  }
  return moves;
}

function findKing(board, white) {
  const target = white ? "K" : "k";
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] === target) return [r, c];
  return null;
}

function isSquareAttacked(board, r, c, byWhite) {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const p = board[i][j];
      if (!p || isWhite(p) !== byWhite) continue;
      const type = p.toLowerCase();
      if (type === "p") {
        const dir = byWhite ? -1 : 1;
        if (i + dir === r && (j - 1 === c || j + 1 === c)) return true;
        continue;
      }
      if (type === "k") {
        if (Math.abs(i - r) <= 1 && Math.abs(j - c) <= 1 && !(i === r && j === c)) return true;
        continue;
      }
      const moves = rawMovesClient(board, i, j, {});
      if (moves.some((m) => m.r === r && m.c === c)) return true;
    }
  }
  return false;
}

function inCheck(board, white) {
  const k = findKing(board, white);
  if (!k) return false;
  return isSquareAttacked(board, k[0], k[1], !white);
}

function applySimpleClient(board, fromR, fromC, toR, toC) {
  const next = cloneBoard(board);
  next[toR][toC] = next[fromR][fromC];
  next[fromR][fromC] = "";
  return next;
}

// Returns legal target squares as [r, c] pairs (flags dropped) for UI
// highlighting/click-handling; castling/promotion are still detected via
// their target square (king moves two files) same as before.
function legalMoves(board, r, c, ctx) {
  const p = board[r][c];
  if (!p) return [];
  const white = isWhite(p);
  const context = ctx || { castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null };
  const candidates = rawMovesClient(board, r, c, context);

  return candidates
    .filter((m) => {
      if (m.flag === "castleK" || m.flag === "castleQ") {
        if (inCheck(board, white)) return false;
        const passC = m.flag === "castleK" ? 5 : 3;
        const midBoard = applySimpleClient(board, r, c, r, passC);
        if (isSquareAttacked(midBoard, r, passC, !white)) return false;
        const endBoard = applySimpleClient(board, r, c, m.r, m.c);
        if (isSquareAttacked(endBoard, m.r, m.c, !white)) return false;
        return true;
      }
      let next = cloneBoard(board);
      if (m.flag === "ep") {
        const capturedRow = white ? m.r + 1 : m.r - 1;
        next[capturedRow][m.c] = "";
      }
      next[m.r][m.c] = next[r][c];
      next[r][c] = "";
      return !inCheck(next, white);
    })
    .map((m) => [m.r, m.c]);
}

function materialDiff(captured) {
  const wGain = captured.w.reduce((s, p) => s + (PIECE_VALUE[p.toLowerCase()] || 0), 0);
  const bGain = captured.b.reduce((s, p) => s + (PIECE_VALUE[p.toLowerCase()] || 0), 0);
  return wGain - bGain;
}

const authScreen = document.getElementById("authScreen");
const lobbyScreen = document.getElementById("lobbyScreen");
const appScreen = document.getElementById("app");
const localGameBtn = document.getElementById("localGameBtn");
const findOnlineBtn = document.getElementById("findOnlineBtn");
const playBotBtn = document.getElementById("playBotBtn");
const botOptions = document.getElementById("botOptions");
const queueStatus = document.getElementById("queueStatus");
const modeTag = document.getElementById("modeTag");
const leaveBtn = document.getElementById("leaveBtn");

const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authError = document.getElementById("authError");
const lobbyUsername = document.getElementById("lobbyUsername");
const logoutBtn = document.getElementById("logoutBtn");

const clockWhiteEl = document.getElementById("clockWhite");
const clockBlackEl = document.getElementById("clockBlack");
const resignBtn = document.getElementById("resignBtn");
const offerDrawBtn = document.getElementById("offerDrawBtn");
const downloadPgnBtn = document.getElementById("downloadPgnBtn");
const newGameBtn = document.getElementById("newGameBtn");
const flipBoardBtn = document.getElementById("flipBoardBtn");
const copyFenBtn = document.getElementById("copyFenBtn");
const drawOfferBanner = document.getElementById("drawOfferBanner");
const drawOfferText = document.getElementById("drawOfferText");
const drawAcceptBtn = document.getElementById("drawAcceptBtn");
const drawDeclineBtn = document.getElementById("drawDeclineBtn");
const blackLabelEl = document.getElementById("blackLabel");
const whiteLabelEl = document.getElementById("whiteLabel");

let currentUser = null;

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("statusLine");
const moveLogEl = document.getElementById("moveLog");
const capturedByWhiteEl = document.getElementById("capturedByWhite");
const capturedByBlackEl = document.getElementById("capturedByBlack");
const promoOverlay = document.getElementById("promoOverlay");
const promoOptionsEl = document.getElementById("promoOptions");
const resultOverlay = document.getElementById("resultOverlay");
const resultText = document.getElementById("resultText");
const resultCloseBtn = document.getElementById("resultCloseBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const analysisOverlay = document.getElementById("analysisOverlay");
const analysisCloseBtn = document.getElementById("analysisCloseBtn");
const analysisSummary = document.getElementById("analysisSummary");
const analysisMoveList = document.getElementById("analysisMoveList");
const tipText = document.getElementById("tipText");

let socket = null;
let myColor = "w";
let currentGameId = null;
let currentMode = null;
let selected = null;
let legalForSelected = [];
let serverState = null;
let botDifficulty = "normal";
let botColorChoice = "w";
let dragState = null;
let suppressNextClick = false;
let preferredOrientation = null;
const staticMode = typeof io === "undefined";

const START_BOARD_CLIENT = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "R"],
];

// ---- Auth ----

tabLogin.addEventListener("click", () => {
  tabLogin.classList.add("active");
  tabSignup.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  authError.classList.add("hidden");
});

tabSignup.addEventListener("click", () => {
  tabSignup.classList.add("active");
  tabLogin.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  authError.classList.add("hidden");
});

function showAuthError(message) {
  authError.textContent = message;
  authError.classList.remove("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || "Login failed.");
    currentUser = data.user;
    showLobby();
  } catch (err) {
    showAuthError("Could not reach the server.");
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("signupUsername").value.trim();
  const password = document.getElementById("signupPassword").value;
  try {
    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) return showAuthError(data.error || "Sign up failed.");
    currentUser = data.user;
    showLobby();
  } catch (err) {
    showAuthError("Could not reach the server.");
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  currentUser = null;
  if (socket) { socket.disconnect(); socket = null; }
  lobbyScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");
});

function showLobby() {
  authScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");
  lobbyUsername.textContent = currentUser.username;
}

async function checkSession() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      showLobby();
    }
  } catch (err) {
    if (staticMode) {
      currentUser = { username: "Guest" };
      showLobby();
      findOnlineBtn.classList.add("hidden");
      playBotBtn.classList.add("hidden");
    }
  }
}

checkSession();

// ---- Socket / gameplay ----

function connectSocket() {
  if (staticMode) return null;
  if (socket) return socket;
  socket = io();

  socket.on("queue:waiting", () => {
    queueStatus.classList.remove("hidden");
  });

  socket.on("game:start", ({ gameId, color, mode }) => {
    currentGameId = gameId;
    myColor = color;
    currentMode = mode;
    queueStatus.classList.add("hidden");
    showApp();
  });

  socket.on("game:state", (state) => {
    serverState = state;
    selected = null;
    legalForSelected = [];
    render();
  });

  socket.on("move:rejected", () => {
    selected = null;
    legalForSelected = [];
    render();
  });

  socket.on("opponent:left", () => {
    if (serverState && serverState.resultReason) return; // real result already shown
    resultText.textContent = "Your opponent disconnected.";
    resultOverlay.classList.remove("hidden");
  });

  socket.on("clock:tick", (clocks) => {
    if (!serverState) return;
    serverState.clocks = clocks;
    renderClocks();
  });

  return socket;
}

resignBtn.addEventListener("click", () => {
  if (!socket || !currentGameId || !serverState || serverState.resultReason) return;
  if (!confirm("Resign this game?")) return;
  socket.emit("game:resign", { gameId: currentGameId });
});

offerDrawBtn.addEventListener("click", () => {
  if (!socket || !currentGameId || !serverState || serverState.resultReason) return;
  socket.emit("draw:offer", { gameId: currentGameId });
});

drawAcceptBtn.addEventListener("click", () => {
  if (!socket || !currentGameId) return;
  socket.emit("draw:respond", { gameId: currentGameId, accept: true });
});

drawDeclineBtn.addEventListener("click", () => {
  if (!socket || !currentGameId) return;
  socket.emit("draw:respond", { gameId: currentGameId, accept: false });
});

downloadPgnBtn.addEventListener("click", () => {
  if (currentMode === "local") {
    downloadLocalPgn();
    return;
  }
  if (!currentGameId) return;
  window.open(`/api/pgn/${currentGameId}`, "_blank");
});

newGameBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
  if (currentMode === "local") {
    startLocalGame();
    return;
  }
  if (currentMode === "bot") {
    connectSocket();
    socket.emit("bot:start", { playerColor: botColorChoice, difficulty: botDifficulty });
    return;
  }
  backToLobby();
});

localGameBtn.addEventListener("click", () => {
  startLocalGame();
});

flipBoardBtn.addEventListener("click", () => {
  preferredOrientation = preferredOrientation === "b" ? "w" : "b";
  applyOrientation();
  render();
});

copyFenBtn.addEventListener("click", async () => {
  if (!serverState) return;
  const fen = stateToFen(serverState);
  try {
    await navigator.clipboard.writeText(fen);
    copyFenBtn.textContent = "FEN Copied";
    setTimeout(() => { copyFenBtn.textContent = "Copy FEN"; }, 1200);
  } catch (err) {
    window.prompt("Copy FEN", fen);
  }
});

findOnlineBtn.addEventListener("click", () => {
  if (staticMode) return;
  botOptions.classList.add("hidden");
  connectSocket();
  socket.emit("queue:join");
  queueStatus.classList.remove("hidden");
});

playBotBtn.addEventListener("click", () => {
  botOptions.classList.remove("hidden");
});

document.querySelectorAll(".bot-diff").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".bot-diff").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    botDifficulty = btn.dataset.diff;
    startBotIfReady();
  });
});

document.querySelectorAll(".bot-color").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".bot-color").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    botColorChoice = btn.dataset.color;
    startBotIfReady();
  });
});

function startBotIfReady() {
  if (staticMode) return;
  const diffChosen = document.querySelector(".bot-diff.active");
  const colorChosen = document.querySelector(".bot-color.active");
  if (!diffChosen || !colorChosen) return;

  connectSocket();
  socket.emit("bot:start", { playerColor: botColorChoice, difficulty: botDifficulty });
}

leaveBtn.addEventListener("click", () => {
  if (socket && currentGameId) {
    socket.emit("game:leave", { gameId: currentGameId });
  }
  backToLobby();
});

resultCloseBtn.addEventListener("click", () => {
  resultOverlay.classList.add("hidden");
  backToLobby();
});

// ---- Interactive game review ----

const reviewBoardEl = document.getElementById("reviewBoard");
const analysisProgress = document.getElementById("analysisProgress");
const analysisProgressText = document.getElementById("analysisProgressText");
const analysisBody = document.getElementById("analysisBody");
const navFirst = document.getElementById("navFirst");
const navPrev = document.getElementById("navPrev");
const navPlay = document.getElementById("navPlay");
const navNext = document.getElementById("navNext");
const navLast = document.getElementById("navLast");
const moveClassBadge = document.getElementById("moveClassBadge");
const coachTextEl = document.getElementById("coachText");
const ratingWhiteElo = document.getElementById("ratingWhiteElo");
const ratingWhiteAcc = document.getElementById("ratingWhiteAcc");
const ratingBlackElo = document.getElementById("ratingBlackElo");
const ratingBlackAcc = document.getElementById("ratingBlackAcc");

let currentAnalysis = null;
let reviewPly = 0; // 0 = start position, N = after move N-1
let reviewPlaying = false;
let reviewTimer = null;

analyzeBtn.addEventListener("click", async () => {
  if (!serverState || !serverState.history || serverState.history.length === 0) return;

  resultOverlay.classList.add("hidden");
  analysisOverlay.classList.remove("hidden");
  analysisProgress.classList.remove("hidden");
  analysisBody.classList.add("hidden");

  const history = serverState.history;

  try {
    currentAnalysis = await analyzeGame(history, (done, total) => {
      analysisProgressText.textContent = `Analyzing move ${done} / ${total}…`;
    });
    reviewPly = currentAnalysis.moves.length; // land on final position
    analysisProgress.classList.add("hidden");
    analysisBody.classList.remove("hidden");
    renderRatings();
    renderSummary();
    renderMoveListNav();
    renderReviewPosition();
  } catch (err) {
    console.error("Analysis failed", err);
    analysisProgressText.textContent = "Analysis failed. Please try again.";
  }
});

analysisCloseBtn.addEventListener("click", () => {
  stopReviewPlayback();
  analysisOverlay.classList.add("hidden");
  currentAnalysis = null;
  backToLobby();
});

navFirst.addEventListener("click", () => { stopReviewPlayback(); reviewPly = 0; renderReviewPosition(); });
navPrev.addEventListener("click", () => { stopReviewPlayback(); reviewPly = Math.max(0, reviewPly - 1); renderReviewPosition(); });
navNext.addEventListener("click", () => { stopReviewPlayback(); stepForward(); });
navLast.addEventListener("click", () => { stopReviewPlayback(); reviewPly = currentAnalysis ? currentAnalysis.moves.length : 0; renderReviewPosition(); });

navPlay.addEventListener("click", () => {
  if (reviewPlaying) {
    stopReviewPlayback();
  } else {
    reviewPlaying = true;
    navPlay.textContent = "⏸";
    reviewTimer = setInterval(() => {
      if (!stepForward()) stopReviewPlayback();
    }, 900);
  }
});

function stepForward() {
  if (!currentAnalysis) return false;
  if (reviewPly >= currentAnalysis.moves.length) return false;
  reviewPly += 1;
  renderReviewPosition();
  return true;
}

function stopReviewPlayback() {
  reviewPlaying = false;
  navPlay.textContent = "▶";
  if (reviewTimer) {
    clearInterval(reviewTimer);
    reviewTimer = null;
  }
}

function renderRatings() {
  if (!currentAnalysis) return;
  const { w, b } = currentAnalysis.rating;
  ratingWhiteElo.textContent = `~${w.elo} Elo`;
  ratingWhiteAcc.textContent = `${w.accuracy}% accuracy`;
  ratingBlackElo.textContent = `~${b.elo} Elo`;
  ratingBlackAcc.textContent = `${b.accuracy}% accuracy`;
}

function renderSummary() {
  if (!currentAnalysis) return;
  const { summary } = currentAnalysis;
  const rows = ["brilliant", "best", "great", "good", "book", "inaccuracy", "mistake", "blunder"];
  const labelFor = {
    brilliant: "Brilliant", best: "Best", great: "Great", good: "Good",
    book: "Book", inaccuracy: "Inaccuracy", mistake: "Mistake", blunder: "Blunder",
  };

  function sideRows(side) {
    return rows
      .filter((k) => summary[side][k] > 0)
      .map((k) => `<p><span class="tag-${k}">${summary[side][k]}</span> ${labelFor[k]}</p>`)
      .join("");
  }

  analysisSummary.innerHTML = `
    <div class="analysis-side">
      <h4>White</h4>
      ${sideRows("w") || "<p>No moves.</p>"}
    </div>
    <div class="analysis-side">
      <h4>Black</h4>
      ${sideRows("b") || "<p>No moves.</p>"}
    </div>
  `;
}

function renderMoveListNav() {
  if (!currentAnalysis) return;
  const { moves } = currentAnalysis;

  analysisMoveList.innerHTML = "";
  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement("div");
    row.className = "analysis-row";

    const num = document.createElement("span");
    num.className = "move-num";
    num.textContent = `${Math.floor(i / 2) + 1}.`;
    row.appendChild(num);

    [moves[i], moves[i + 1]].forEach((m) => {
      const cell = document.createElement("span");
      if (!m) {
        cell.textContent = "";
      } else {
        cell.className = `analysis-cell analysis-${m.classification}`;
        const notation = `${FILES[m.fromC]}${8 - m.fromR}-${FILES[m.toC]}${8 - m.toR}`;
        cell.textContent = notation;
        cell.dataset.ply = m.ply + 1;
        cell.addEventListener("click", () => {
          stopReviewPlayback();
          reviewPly = m.ply + 1;
          renderReviewPosition();
        });
      }
      row.appendChild(cell);
    });

    analysisMoveList.appendChild(row);
  }
}

function renderReviewPosition() {
  if (!currentAnalysis) return;
  const board = currentAnalysis.boards[reviewPly];

  reviewBoardEl.innerHTML = "";
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");

      if (reviewPly > 0) {
        const lastMove = currentAnalysis.moves[reviewPly - 1];
        if ((lastMove.fromR === r && lastMove.fromC === c) || (lastMove.toR === r && lastMove.toC === c)) {
          sq.classList.add("last-move");
        }
      }

      const piece = board[r][c];
      if (piece) {
        const wrap = document.createElement("div");
        wrap.className = "piece";
        wrap.innerHTML = getPieceSVG(piece);
        sq.appendChild(wrap);
      }
      reviewBoardEl.appendChild(sq);
    }
  }

  document.querySelectorAll(".analysis-cell").forEach((el) => el.classList.remove("active-ply"));
  if (reviewPly > 0) {
    const activeCell = analysisMoveList.querySelector(`[data-ply="${reviewPly}"]`);
    if (activeCell) {
      activeCell.classList.add("active-ply");
      activeCell.scrollIntoView({ block: "nearest" });
    }
  }

  if (reviewPly === 0) {
    moveClassBadge.textContent = "Start position";
    moveClassBadge.className = "move-class-badge";
    coachTextEl.textContent = "Use the controls to step through the game.";
  } else {
    const m = currentAnalysis.moves[reviewPly - 1];
    const label = m.classification.charAt(0).toUpperCase() + m.classification.slice(1);
    const sideLabel = m.mover === "w" ? "White" : "Black";
    moveClassBadge.textContent = `${sideLabel}: ${label}`;
    moveClassBadge.className = `move-class-badge badge-${m.classification}`;
    coachTextEl.textContent = m.coachText;
  }
}

function backToLobby() {
  currentGameId = null;
  currentMode = null;
  serverState = null;
  selected = null;
  legalForSelected = [];
  appScreen.classList.add("hidden");
  lobbyScreen.classList.remove("hidden");
  queueStatus.classList.add("hidden");
  drawOfferBanner.classList.add("hidden");
  resultOverlay.classList.add("hidden");
  clockWhiteEl.textContent = "10:00";
  clockBlackEl.textContent = "10:00";
  clockWhiteEl.classList.remove("low-time", "active-clock");
  clockBlackEl.classList.remove("low-time", "active-clock");
}

function showApp() {
  lobbyScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  modeTag.textContent = currentMode === "bot" ? "vs Bot" : currentMode === "local" ? "Local Game" : "Online Match";
  applyOrientation();
}

function applyOrientation() {
  const filesRow = document.getElementById("filesRow");
  const ranksCol = document.getElementById("ranksCol");
  const orientation = preferredOrientation || myColor;
  const fileLabels = orientation === "b" ? [...FILES].reverse() : FILES;
  const rankLabels = orientation === "b" ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  filesRow.innerHTML = fileLabels.map((f) => `<span>${f}</span>`).join("");
  ranksCol.innerHTML = rankLabels.map((n) => `<span>${n}</span>`).join("");
}

function boardCoordsToDisplay(r, c) {
  const orientation = preferredOrientation || myColor;
  if (orientation === "b") return [7 - r, 7 - c];
  return [r, c];
}

function displayCoordsToBoard(dr, dc) {
  const orientation = preferredOrientation || myColor;
  if (orientation === "b") return [7 - dr, 7 - dc];
  return [dr, dc];
}

function buildBoardSkeleton() {
  boardEl.innerHTML = "";
  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const sq = document.createElement("div");
      const [r, c] = displayCoordsToBoard(dr, dc);
      sq.className = "square " + ((r + c) % 2 === 0 ? "light" : "dark");
      sq.dataset.dr = dr;
      sq.dataset.dc = dc;
      sq.addEventListener("click", () => onSquareClick(dr, dc));
      boardEl.appendChild(sq);
    }
  }
}

function squareElByDisplay(dr, dc) {
  return boardEl.querySelector(`[data-dr="${dr}"][data-dc="${dc}"]`);
}

function render() {
  if (!serverState) return;

  buildBoardSkeleton();

  const { board, turn, history, captured, status } = serverState;
  const whiteTurn = turn === "w";
  const lastMove = history && history.length ? history[history.length - 1] : null;

  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const [r, c] = displayCoordsToBoard(dr, dc);
      const sq = squareElByDisplay(dr, dc);
      const piece = board[r][c];

      if (lastMove && ((lastMove.fromR === r && lastMove.fromC === c) || (lastMove.toR === r && lastMove.toC === c))) {
        sq.classList.add("last-move");
      }

      if (selected && selected[0] === r && selected[1] === c) {
        sq.classList.add("selected");
      }

      if ((status === "check" || status === "checkmate") && piece && piece.toLowerCase() === "k" && isWhite(piece) === whiteTurn) {
        sq.classList.add("in-check");
      }

      if (piece) {
        const pieceWrap = document.createElement("div");
        pieceWrap.className = "piece";
        pieceWrap.dataset.r = r;
        pieceWrap.dataset.c = c;
        pieceWrap.innerHTML = getPieceSVG(piece);
        pieceWrap.addEventListener("pointerdown", onPiecePointerDown);
        sq.appendChild(pieceWrap);
      }

      const isOption = legalForSelected.some(([mr, mc]) => mr === r && mc === c);
      if (isOption) {
        const marker = document.createElement("div");
        marker.className = piece ? "capture-ring" : "move-dot";
        sq.appendChild(marker);
      }
    }
  }

  renderStatus(status, whiteTurn);
  renderCaptured(captured);
  renderMoveLog(history);
  renderTip();
  renderClocks();
  renderDrawOffer();
  renderPlayerLabels();

  if (serverState.resultReason) {
    resultText.textContent = resultMessage(serverState.resultReason, serverState.winner);
    resultOverlay.classList.remove("hidden");
  }
}

const RESULT_LABELS = {
  checkmate: (winner) => `Checkmate — ${winner === "w" ? "White" : "Black"} wins`,
  stalemate: () => "Stalemate — draw",
  resign: (winner) => `${winner === "w" ? "White" : "Black"} wins by resignation`,
  timeout: (winner) => `${winner === "w" ? "White" : "Black"} wins on time`,
  "draw-agreed": () => "Draw agreed",
  "draw-50move": () => "Draw — 50-move rule",
  "draw-repetition": () => "Draw — threefold repetition",
  "draw-material": () => "Draw — insufficient material",
  abandoned: (winner) => `${winner === "w" ? "White" : "Black"} wins — opponent left`,
};

function resultMessage(reason, winner) {
  const fn = RESULT_LABELS[reason];
  return fn ? fn(winner) : "Game over";
}

function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}

function renderClocks() {
  if (!serverState || !serverState.clocks) return;
  clockWhiteEl.textContent = formatClock(serverState.clocks.w);
  clockBlackEl.textContent = formatClock(serverState.clocks.b);
  clockWhiteEl.classList.toggle("low-time", serverState.clocks.w <= 30);
  clockBlackEl.classList.toggle("low-time", serverState.clocks.b <= 30);
  const whiteTurn = serverState.turn === "w";
  const gameOver = !!serverState.resultReason;
  clockWhiteEl.classList.toggle("active-clock", whiteTurn && !gameOver);
  clockBlackEl.classList.toggle("active-clock", !whiteTurn && !gameOver);
}

function renderPlayerLabels() {
  if (!serverState || !serverState.players) return;
  const white = serverState.players.find((p) => p.color === "w");
  const black = serverState.players.find((p) => p.color === "b");
  whiteLabelEl.textContent = (white && white.username) || "White";
  blackLabelEl.textContent = (black && black.username) || "Black";
}

function renderDrawOffer() {
  if (!serverState) return;
  const offerBy = serverState.drawOfferBy;
  if (!offerBy || serverState.resultReason) {
    drawOfferBanner.classList.add("hidden");
    return;
  }
  if (offerBy === myColor) {
    drawOfferText.textContent = "Draw offer sent — waiting for your opponent.";
    drawAcceptBtn.classList.add("hidden");
    drawDeclineBtn.classList.add("hidden");
  } else {
    drawOfferText.textContent = "Your opponent offered a draw.";
    drawAcceptBtn.classList.remove("hidden");
    drawDeclineBtn.classList.remove("hidden");
  }
  drawOfferBanner.classList.remove("hidden");
}

function renderStatus(status, whiteTurn) {
  let text;
  let isCheckStyle = false;

  if (serverState && serverState.resultReason) {
    text = resultMessage(serverState.resultReason, serverState.winner);
    isCheckStyle = true;
  } else if (status === "check") {
    text = `${whiteTurn ? "White" : "Black"} is in check`;
    isCheckStyle = true;
  } else {
    text = `${whiteTurn ? "White" : "Black"} to move`;
  }

  statusEl.textContent = text;
  statusEl.classList.toggle("check", isCheckStyle);
}

function renderCaptured(captured) {
  const diff = materialDiff(captured);

  capturedByWhiteEl.innerHTML = "";
  captured.w.forEach((p) => {
    const el = document.createElement("span");
    el.className = "cap-piece";
    el.innerHTML = getPieceSVG(p);
    capturedByWhiteEl.appendChild(el);
  });
  if (diff > 0) capturedByWhiteEl.appendChild(diffTag(diff));

  capturedByBlackEl.innerHTML = "";
  captured.b.forEach((p) => {
    const el = document.createElement("span");
    el.className = "cap-piece";
    el.innerHTML = getPieceSVG(p);
    capturedByBlackEl.appendChild(el);
  });
  if (diff < 0) capturedByBlackEl.appendChild(diffTag(-diff));
}

function diffTag(value) {
  const tag = document.createElement("span");
  tag.textContent = `+${value}`;
  tag.style.marginLeft = "4px";
  tag.style.fontSize = "12px";
  tag.style.alignSelf = "center";
  return tag;
}

function renderMoveLog(history) {
  moveLogEl.innerHTML = "";
  if (!history || history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "move-log-empty";
    empty.textContent = "No moves yet.";
    moveLogEl.appendChild(empty);
    return;
  }

  const notations = history.map((m) => {
    const label = PIECE_NAME[m.piece.toLowerCase()][0].toUpperCase();
    const capMark = "-";
    return `${label}${FILES[m.fromC]}${8 - m.fromR}${capMark}${FILES[m.toC]}${8 - m.toR}`;
  });

  for (let i = 0; i < notations.length; i += 2) {
    const row = document.createElement("div");
    row.className = "move-row";
    const num = document.createElement("span");
    num.className = "move-num";
    num.textContent = `${Math.floor(i / 2) + 1}.`;
    const whiteMove = document.createElement("span");
    whiteMove.textContent = notations[i] || "";
    const blackMove = document.createElement("span");
    blackMove.textContent = notations[i + 1] || "";
    row.appendChild(num);
    row.appendChild(whiteMove);
    row.appendChild(blackMove);
    moveLogEl.appendChild(row);
  }
  moveLogEl.scrollTop = moveLogEl.scrollHeight;
}

function renderTip() {
  if (!serverState) return;
  const myTurn = currentMode === "local" || serverState.turn === myColor;
  tipText.textContent = myTurn
    ? "Click or drag a piece to a legal square."
    : "Waiting for your opponent's move…";
}

function onSquareClick(dr, dc) {
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (!serverState) return;
  if (serverState.resultReason) return;
  if (currentMode !== "local" && serverState.turn !== myColor) return;

  const [r, c] = displayCoordsToBoard(dr, dc);
  const piece = serverState.board[r][c];
  const movableColor = currentMode === "local" ? serverState.turn : myColor;

  if (selected) {
    const [sr, sc] = selected;
    const isOption = legalForSelected.some(([mr, mc]) => mr === r && mc === c);

    if (isOption) {
      const movingPiece = serverState.board[sr][sc];
      const isPromotion = movingPiece.toLowerCase() === "p" && (r === 0 || r === 7);
      if (isPromotion) {
        openPromotion(sr, sc, r, c);
      } else {
        sendMove(sr, sc, r, c, null);
      }
      return;
    }

    if (piece && isWhite(piece) === (movableColor === "w")) {
      selectSquare(r, c);
    } else {
      selected = null;
      legalForSelected = [];
      render();
    }
    return;
  }

  if (piece && isWhite(piece) === (movableColor === "w")) {
    selectSquare(r, c);
  }
}

function selectSquare(r, c) {
  selected = [r, c];
  const ctx = { castling: serverState.castling, enPassant: serverState.enPassant };
  legalForSelected = legalMoves(serverState.board, r, c, ctx);
  render();
}

function sendMove(fromR, fromC, toR, toC, promotion) {
  if (currentMode === "local") {
    makeLocalMove(fromR, fromC, toR, toC, promotion);
    return;
  }
  socket.emit("move:make", {
    gameId: currentGameId,
    fromR,
    fromC,
    toR,
    toC,
    promotion,
  });
  selected = null;
  legalForSelected = [];
}

function openPromotion(fromR, fromC, toR, toC) {
  const whiteMoving = myColor === "w";
  promoOptionsEl.innerHTML = "";

  ["q", "r", "b", "n"].forEach((letter) => {
    const btn = document.createElement("button");
    btn.className = "promo-cell";
    btn.innerHTML = getPieceSVG(whiteMoving ? letter.toUpperCase() : letter);
    btn.addEventListener("click", () => {
      promoOverlay.classList.add("hidden");
      sendMove(fromR, fromC, toR, toC, letter);
    });
    promoOptionsEl.appendChild(btn);
  });

  promoOverlay.classList.remove("hidden");
}

function onPiecePointerDown(event) {
  if (!serverState || serverState.resultReason) return;
  if (currentMode !== "local" && serverState.turn !== myColor) return;

  const pieceEl = event.currentTarget;
  const r = Number(pieceEl.dataset.r);
  const c = Number(pieceEl.dataset.c);
  const piece = serverState.board[r][c];
  const movableColor = currentMode === "local" ? serverState.turn : myColor;
  if (!piece || isWhite(piece) !== (movableColor === "w")) return;

  event.preventDefault();
  pieceEl.setPointerCapture(event.pointerId);
  selectSquare(r, c);

  const rect = pieceEl.getBoundingClientRect();
  const ghost = pieceEl.cloneNode(true);
  ghost.classList.add("drag-ghost");
  document.body.appendChild(ghost);

  dragState = {
    pointerId: event.pointerId,
    fromR: r,
    fromC: c,
    ghost,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
  };

  positionDragGhost(event.clientX, event.clientY);
  pieceEl.classList.add("drag-source");
  window.addEventListener("pointermove", onPiecePointerMove, { passive: false });
  window.addEventListener("pointerup", onPiecePointerUp, { passive: false });
  window.addEventListener("pointercancel", cancelPieceDrag, { passive: false });
}

function onPiecePointerMove(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
  dragState.moved = dragState.moved || distance > 4;
  positionDragGhost(event.clientX, event.clientY);
}

function onPiecePointerUp(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();

  const target = document.elementFromPoint(event.clientX, event.clientY);
  const square = target && target.closest ? target.closest(".square") : null;
  const state = dragState;
  cleanupDrag();

  if (!state.moved || !square || !boardEl.contains(square)) {
    render();
    return;
  }

  suppressNextClick = true;
  const [toR, toC] = displayCoordsToBoard(Number(square.dataset.dr), Number(square.dataset.dc));
  const legal = legalForSelected.some(([mr, mc]) => mr === toR && mc === toC);
  if (!legal) {
    render();
    return;
  }

  const movingPiece = serverState.board[state.fromR][state.fromC];
  if (movingPiece.toLowerCase() === "p" && (toR === 0 || toR === 7)) {
    openPromotion(state.fromR, state.fromC, toR, toC);
  } else {
    sendMove(state.fromR, state.fromC, toR, toC, null);
  }
}

function cancelPieceDrag(event) {
  if (dragState && event.pointerId === dragState.pointerId) {
    cleanupDrag();
    render();
  }
}

function positionDragGhost(clientX, clientY) {
  if (!dragState) return;
  dragState.ghost.style.left = `${clientX - dragState.offsetX}px`;
  dragState.ghost.style.top = `${clientY - dragState.offsetY}px`;
}

function cleanupDrag() {
  window.removeEventListener("pointermove", onPiecePointerMove);
  window.removeEventListener("pointerup", onPiecePointerUp);
  window.removeEventListener("pointercancel", cancelPieceDrag);
  if (dragState && dragState.ghost) dragState.ghost.remove();
  document.querySelectorAll(".drag-source").forEach((el) => el.classList.remove("drag-source"));
  dragState = null;
}

function stateToFen(state) {
  const rows = state.board.map((row) => {
    let empty = 0;
    let text = "";
    row.forEach((piece) => {
      if (!piece) {
        empty += 1;
      } else {
        if (empty) text += empty;
        empty = 0;
        text += piece;
      }
    });
    return text + (empty || "");
  });
  const castling = [
    state.castling.wK ? "K" : "",
    state.castling.wQ ? "Q" : "",
    state.castling.bK ? "k" : "",
    state.castling.bQ ? "q" : "",
  ].join("") || "-";
  const ep = state.enPassant ? `${FILES[state.enPassant.c]}${8 - state.enPassant.r}` : "-";
  return `${rows.join("/")} ${state.turn} ${castling} ${ep} 0 ${Math.floor((state.history.length / 2) + 1)}`;
}

function startLocalGame() {
  currentGameId = "local";
  currentMode = "local";
  myColor = "w";
  preferredOrientation = preferredOrientation || "w";
  selected = null;
  legalForSelected = [];
  serverState = {
    board: cloneBoard(START_BOARD_CLIENT),
    turn: "w",
    castling: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: null,
    halfmoveClock: 0,
    history: [],
    captured: { w: [], b: [] },
    status: "playing",
    clocks: { w: 600, b: 600 },
    drawOfferBy: null,
    resultReason: null,
    winner: null,
    players: [
      { color: "w", username: "White" },
      { color: "b", username: "Black" },
    ],
  };
  showApp();
  render();
}

function makeLocalMove(fromR, fromC, toR, toC, promotion) {
  const piece = serverState.board[fromR][fromC];
  const white = isWhite(piece);
  const legal = legalMoves(serverState.board, fromR, fromC, {
    castling: serverState.castling,
    enPassant: serverState.enPassant,
  });
  const chosen = legal.find(([r, c]) => r === toR && c === toC);
  if (!chosen) {
    selected = null;
    legalForSelected = [];
    render();
    return;
  }

  const next = cloneBoard(serverState.board);
  let captured = next[toR][toC] || null;
  let flag = null;
  const type = piece.toLowerCase();

  if (type === "p" && serverState.enPassant && serverState.enPassant.r === toR && serverState.enPassant.c === toC && !captured) {
    const capturedRow = white ? toR + 1 : toR - 1;
    captured = next[capturedRow][toC];
    next[capturedRow][toC] = "";
    flag = "ep";
  }

  next[toR][toC] = promotion ? (white ? promotion.toUpperCase() : promotion.toLowerCase()) : piece;
  next[fromR][fromC] = "";

  if (type === "k" && Math.abs(toC - fromC) === 2) {
    flag = toC > fromC ? "castleK" : "castleQ";
    if (toC > fromC) {
      next[fromR][5] = next[fromR][7];
      next[fromR][7] = "";
    } else {
      next[fromR][3] = next[fromR][0];
      next[fromR][0] = "";
    }
  }

  const castling = { ...serverState.castling };
  if (type === "k") {
    if (white) { castling.wK = false; castling.wQ = false; }
    else { castling.bK = false; castling.bQ = false; }
  }
  if (type === "r") {
    if (fromR === 7 && fromC === 0) castling.wQ = false;
    if (fromR === 7 && fromC === 7) castling.wK = false;
    if (fromR === 0 && fromC === 0) castling.bQ = false;
    if (fromR === 0 && fromC === 7) castling.bK = false;
  }
  if (toR === 7 && toC === 0) castling.wQ = false;
  if (toR === 7 && toC === 7) castling.wK = false;
  if (toR === 0 && toC === 0) castling.bQ = false;
  if (toR === 0 && toC === 7) castling.bK = false;

  const nextTurn = serverState.turn === "w" ? "b" : "w";
  const enPassant = type === "p" && Math.abs(toR - fromR) === 2 ? { r: (fromR + toR) / 2, c: fromC } : null;
  const capturedSide = captured ? (isWhite(captured) ? "w" : "b") : null;
  const capturedNext = { w: serverState.captured.w.slice(), b: serverState.captured.b.slice() };
  if (capturedSide) capturedNext[capturedSide].push(captured);

  serverState.board = next;
  serverState.castling = castling;
  serverState.enPassant = enPassant;
  serverState.turn = nextTurn;
  serverState.captured = capturedNext;
  serverState.history.push({ fromR, fromC, toR, toC, piece, promotion, flag, captured });
  serverState.status = gameStatusClient(serverState, nextTurn === "w");

  if (serverState.status === "checkmate") {
    serverState.resultReason = "checkmate";
    serverState.winner = nextTurn === "w" ? "b" : "w";
  } else if (serverState.status === "stalemate") {
    serverState.resultReason = "stalemate";
    serverState.winner = null;
  }

  selected = null;
  legalForSelected = [];
  render();
}

function gameStatusClient(state, whiteTurn) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = state.board[r][c];
      if (piece && isWhite(piece) === whiteTurn) {
        moves.push(...legalMoves(state.board, r, c, { castling: state.castling, enPassant: state.enPassant }));
      }
    }
  }
  if (moves.length === 0) return inCheck(state.board, whiteTurn) ? "checkmate" : "stalemate";
  return inCheck(state.board, whiteTurn) ? "check" : "playing";
}

function downloadLocalPgn() {
  const lines = ["[Event \"GreenChess Local Game\"]", "[Site \"GreenChess\"]", "[Result \"*\"]", ""];
  const moves = serverState.history.map((m) => `${FILES[m.fromC]}${8 - m.fromR}${FILES[m.toC]}${8 - m.toR}${m.promotion || ""}`);
  for (let i = 0; i < moves.length; i += 2) {
    lines.push(`${Math.floor(i / 2) + 1}. ${moves[i]}${moves[i + 1] ? ` ${moves[i + 1]}` : ""}`);
  }
  const blob = new Blob([lines.join("\n")], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "greenchess-local.pgn";
  a.click();
  URL.revokeObjectURL(url);
}

buildBoardSkeleton();
