const START_BOARD = [
  ["r", "n", "b", "q", "k", "b", "n", "r"],
  ["p", "p", "p", "p", "p", "p", "p", "p"],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["P", "P", "P", "P", "P", "P", "P", "P"],
  ["R", "N", "B", "Q", "K", "B", "N", "R"],
];

function cloneBoardUtil(b) {
  return b.map((row) => row.slice());
}

// Applies a move recorded by the server, which already tells us whether it
// was a castle or en passant capture (via m.flag/isCastle/isEnPassant), so
// replay here just needs to mirror those side effects on the board array.
function applyMoveUtil(board, m) {
  const next = cloneBoardUtil(board);
  const { fromR, fromC, toR, toC, promotion } = m;
  const piece = next[fromR][fromC];
  const isWhitePiece = piece === piece.toUpperCase();
  let captured = next[toR][toC] || null;

  if (m.isEnPassant || m.flag === "ep") {
    const capturedRow = isWhitePiece ? toR + 1 : toR - 1;
    captured = next[capturedRow][toC];
    next[capturedRow][toC] = "";
  }

  next[toR][toC] = promotion
    ? (isWhitePiece ? promotion.toUpperCase() : promotion.toLowerCase())
    : piece;
  next[fromR][fromC] = "";

  if (m.flag === "castleK") {
    next[fromR][5] = next[fromR][7];
    next[fromR][7] = "";
  } else if (m.flag === "castleQ") {
    next[fromR][3] = next[fromR][0];
    next[fromR][0] = "";
  }

  return { board: next, captured };
}

// Rebuilds every board position from the initial position through the
// full move history. Returns an array of boards, boards[0] is the start
// position, boards[i] is the position after move i-1 was played.
function replayBoards(history) {
  const boards = [cloneBoardUtil(START_BOARD)];
  let board = cloneBoardUtil(START_BOARD);
  for (const m of history) {
    const { board: next } = applyMoveUtil(board, m);
    board = next;
    boards.push(cloneBoardUtil(board));
  }
  return boards;
}

// Converts our board array + side to move into a FEN string. Castling
// rights/en passant target aren't tracked here since the review engine
// only needs material + position for evaluation, not to re-derive legality.
function boardToFEN(board, whiteToMove) {
  const rows = board.map((row) => {
    let fenRow = "";
    let empty = 0;
    for (const cell of row) {
      if (!cell) {
        empty++;
      } else {
        if (empty > 0) {
          fenRow += empty;
          empty = 0;
        }
        fenRow += cell;
      }
    }
    if (empty > 0) fenRow += empty;
    return fenRow;
  });
  const placement = rows.join("/");
  const active = whiteToMove ? "w" : "b";
  return `${placement} ${active} - - 0 1`;
}

// Converts a from/to move (row/col) into UCI square notation, e.g. e2e4.
function moveToUCI(fromR, fromC, toR, toC, promotion) {
  const files = "abcdefgh";
  const from = `${files[fromC]}${8 - fromR}`;
  const to = `${files[toC]}${8 - toR}`;
  return `${from}${to}${promotion ? promotion.toLowerCase() : ""}`;
}

function uciToSquares(uci) {
  const files = "abcdefgh";
  const fromC = files.indexOf(uci[0]);
  const fromR = 8 - parseInt(uci[1], 10);
  const toC = files.indexOf(uci[2]);
  const toR = 8 - parseInt(uci[3], 10);
  const promotion = uci.length > 4 ? uci[4] : null;
  return { fromR, fromC, toR, toC, promotion };
}
