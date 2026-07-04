export const CHECKER_COLORS = Object.freeze({ BLACK: "black", WHITE: "white" });

const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

function row(index) { return Math.floor(index / 8); }
function column(index) { return index % 8; }
function indexAt(r, c) { return r * 8 + c; }
function inside(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function colorOf(piece) {
  if (!piece) return null;
  return piece.toLowerCase() === "b" ? CHECKER_COLORS.BLACK : CHECKER_COLORS.WHITE;
}
function isKing(piece) { return piece === "B" || piece === "W"; }
function opponent(color) { return color === CHECKER_COLORS.BLACK ? CHECKER_COLORS.WHITE : CHECKER_COLORS.BLACK; }

export function createCheckersGame(previous = null) {
  const board = Array(64).fill("");
  for (let index = 0; index < 64; index += 1) {
    if ((row(index) + column(index)) % 2 === 0) continue;
    if (row(index) < 3) board[index] = "b";
    if (row(index) > 4) board[index] = "w";
  }

  return {
    board,
    turn: CHECKER_COLORS.BLACK,
    winner: null,
    forcedFrom: null,
    round: (previous?.round ?? 0) + 1,
    revision: (previous?.revision ?? 0) + 1,
  };
}

function capturesFor(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const ownColor = colorOf(piece);
  const moves = [];

  if (!isKing(piece)) {
    for (const [dr, dc] of DIRECTIONS) {
      const middleRow = row(from) + dr;
      const middleColumn = column(from) + dc;
      const targetRow = row(from) + dr * 2;
      const targetColumn = column(from) + dc * 2;
      if (!inside(targetRow, targetColumn) || !inside(middleRow, middleColumn)) continue;
      const captured = indexAt(middleRow, middleColumn);
      const to = indexAt(targetRow, targetColumn);
      if (board[captured] && colorOf(board[captured]) !== ownColor && !board[to]) {
        moves.push({ from, to, captured });
      }
    }
    return moves;
  }

  for (const [dr, dc] of DIRECTIONS) {
    let r = row(from) + dr;
    let c = column(from) + dc;
    let captured = null;
    while (inside(r, c)) {
      const current = indexAt(r, c);
      if (board[current]) {
        if (colorOf(board[current]) === ownColor || captured !== null) break;
        captured = current;
      } else if (captured !== null) {
        moves.push({ from, to: current, captured });
      }
      r += dr;
      c += dc;
    }
  }
  return moves;
}

function quietMovesFor(board, from) {
  const piece = board[from];
  if (!piece) return [];
  const moves = [];
  const directions = isKing(piece)
    ? DIRECTIONS
    : colorOf(piece) === CHECKER_COLORS.BLACK
      ? [[1, -1], [1, 1]]
      : [[-1, -1], [-1, 1]];

  for (const [dr, dc] of directions) {
    let r = row(from) + dr;
    let c = column(from) + dc;
    while (inside(r, c) && !board[indexAt(r, c)]) {
      moves.push({ from, to: indexAt(r, c), captured: null });
      if (!isKing(piece)) break;
      r += dr;
      c += dc;
    }
  }
  return moves;
}

export function getCheckersMoves(game, color = game?.turn) {
  if (!game || game.winner) return [];
  if (game.forcedFrom !== null) return capturesFor(game.board, game.forcedFrom);

  const pieces = game.board
    .map((piece, index) => colorOf(piece) === color ? index : -1)
    .filter((index) => index >= 0);
  const captures = pieces.flatMap((from) => capturesFor(game.board, from));
  return captures.length ? captures : pieces.flatMap((from) => quietMovesFor(game.board, from));
}

export function playCheckersMove(game, from, to, color) {
  if (!game || game.winner || game.turn !== color) return game;
  const move = getCheckersMoves(game, color).find((candidate) => candidate.from === from && candidate.to === to);
  if (!move) return game;

  const board = [...game.board];
  let piece = board[from];
  board[from] = "";
  if (move.captured !== null) board[move.captured] = "";

  if (piece === "b" && row(to) === 7) piece = "B";
  if (piece === "w" && row(to) === 0) piece = "W";
  board[to] = piece;

  if (move.captured !== null && capturesFor(board, to).length) {
    return {
      ...game,
      board,
      forcedFrom: to,
      revision: game.revision + 1,
    };
  }

  const nextTurn = opponent(color);
  const candidate = {
    ...game,
    board,
    turn: nextTurn,
    forcedFrom: null,
    revision: game.revision + 1,
  };
  const opponentHasPieces = board.some((value) => colorOf(value) === nextTurn);
  const opponentHasMoves = getCheckersMoves(candidate, nextTurn).length > 0;
  if (!opponentHasPieces || !opponentHasMoves) candidate.winner = color;
  return candidate;
}

export function chooseCheckersMove(game, color) {
  const moves = getCheckersMoves(game, color);
  if (!moves.length) return null;
  return moves.find((move) => move.captured !== null) ?? moves[Math.floor(Math.random() * moves.length)];
}

export function countCheckers(board, color) {
  return board.filter((piece) => colorOf(piece) === color).length;
}

export function isCheckersState(value) {
  return Boolean(
    value
    && Array.isArray(value.board)
    && value.board.length === 64
    && [CHECKER_COLORS.BLACK, CHECKER_COLORS.WHITE].includes(value.turn)
    && Number.isInteger(value.revision),
  );
}
