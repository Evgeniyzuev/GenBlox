export const REVERSI_COLORS = Object.freeze({ BLACK: "B", WHITE: "W" });

const SIZE = 8;
const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

function row(index) { return Math.floor(index / SIZE); }
function column(index) { return index % SIZE; }
function indexAt(r, c) { return r * SIZE + c; }
function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
export function reversiOpponent(color) { return color === REVERSI_COLORS.BLACK ? REVERSI_COLORS.WHITE : REVERSI_COLORS.BLACK; }

function flipsFor(board, index, color) {
  if (board[index]) return [];
  const rival = reversiOpponent(color);
  const flips = [];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let r = row(index) + dr;
    let c = column(index) + dc;
    while (inside(r, c) && board[indexAt(r, c)] === rival) {
      line.push(indexAt(r, c));
      r += dr;
      c += dc;
    }
    if (line.length && inside(r, c) && board[indexAt(r, c)] === color) flips.push(...line);
  }
  return flips;
}

export function getReversiMoves(game, color = game?.turn) {
  if (!game || game.winner) return [];
  return game.board
    .map((_, index) => ({ index, flips: flipsFor(game.board, index, color) }))
    .filter((move) => move.flips.length);
}

export function countReversi(board, color) {
  return board.filter((value) => value === color).length;
}

function winnerFor(board) {
  const black = countReversi(board, REVERSI_COLORS.BLACK);
  const white = countReversi(board, REVERSI_COLORS.WHITE);
  if (black === white) return "draw";
  return black > white ? REVERSI_COLORS.BLACK : REVERSI_COLORS.WHITE;
}

export function createReversiGame(previous = null) {
  const board = Array(SIZE * SIZE).fill("");
  board[indexAt(3, 3)] = REVERSI_COLORS.WHITE;
  board[indexAt(3, 4)] = REVERSI_COLORS.BLACK;
  board[indexAt(4, 3)] = REVERSI_COLORS.BLACK;
  board[indexAt(4, 4)] = REVERSI_COLORS.WHITE;
  return {
    kind: "reversi",
    board,
    turn: REVERSI_COLORS.BLACK,
    winner: null,
    scores: previous?.scores ?? { B: 0, W: 0 },
    round: (previous?.round ?? 0) + 1,
    revision: (previous?.revision ?? 0) + 1,
  };
}

export function playReversiMove(game, index, color) {
  if (!game || game.winner || game.turn !== color) return game;
  const flips = flipsFor(game.board, index, color);
  if (!flips.length) return game;
  const board = [...game.board];
  board[index] = color;
  flips.forEach((flip) => { board[flip] = color; });

  const rival = reversiOpponent(color);
  const nextTurn = getReversiMoves({ ...game, board }, rival).length ? rival : color;
  const noMoves = !getReversiMoves({ ...game, board }, nextTurn).length;
  const winner = noMoves || board.every(Boolean) ? winnerFor(board) : null;
  const scores = { ...game.scores };
  if (winner === REVERSI_COLORS.BLACK || winner === REVERSI_COLORS.WHITE) scores[winner] += 1;

  return {
    ...game,
    board,
    turn: winner ? rival : nextTurn,
    winner,
    scores,
    revision: game.revision + 1,
  };
}

export function chooseReversiMove(game, color = REVERSI_COLORS.WHITE) {
  const moves = getReversiMoves(game, color);
  if (!moves.length) return -1;
  const corners = new Set([0, 7, 56, 63]);
  return moves
    .map((move) => ({
      index: move.index,
      score: move.flips.length + (corners.has(move.index) ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score)[0].index;
}

export function isReversiState(value) {
  return Boolean(
    value
    && Array.isArray(value.board)
    && value.board.length === SIZE * SIZE
    && [REVERSI_COLORS.BLACK, REVERSI_COLORS.WHITE].includes(value.turn)
    && Number.isInteger(value.revision),
  );
}
