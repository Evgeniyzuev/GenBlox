export const FIVE_MARKS = Object.freeze({ BLACK: "X", WHITE: "O" });

const SIZE = 15;
const WIN_LENGTH = 5;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function row(index) { return Math.floor(index / SIZE); }
function column(index) { return index % SIZE; }
function indexAt(r, c) { return r * SIZE + c; }
function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function opponent(mark) { return mark === FIVE_MARKS.BLACK ? FIVE_MARKS.WHITE : FIVE_MARKS.BLACK; }

function findWinningLine(board, from, mark) {
  const startRow = row(from);
  const startColumn = column(from);

  for (const [dr, dc] of DIRECTIONS) {
    const line = [from];

    for (const direction of [-1, 1]) {
      let r = startRow + dr * direction;
      let c = startColumn + dc * direction;
      while (inside(r, c) && board[indexAt(r, c)] === mark) {
        line.push(indexAt(r, c));
        r += dr * direction;
        c += dc * direction;
      }
    }

    if (line.length >= WIN_LENGTH) return line.sort((a, b) => a - b).slice(0, WIN_LENGTH);
  }

  return [];
}

export function createFiveInRowGame(previous = null) {
  const round = (previous?.round ?? 0) + 1;
  const starter = round % 2 === 1 ? FIVE_MARKS.BLACK : FIVE_MARKS.WHITE;
  return {
    kind: "five-in-row",
    size: SIZE,
    board: Array(SIZE * SIZE).fill(""),
    turn: starter,
    starter,
    winner: null,
    winningLine: [],
    round,
    scores: previous?.scores ?? { X: 0, O: 0 },
    revision: (previous?.revision ?? 0) + 1,
  };
}

export function playFiveInRowMove(game, index, mark) {
  if (!game || game.winner || game.turn !== mark || game.board[index]) return game;
  const board = [...game.board];
  board[index] = mark;
  const winningLine = findWinningLine(board, index, mark);
  const winner = winningLine.length ? mark : board.every(Boolean) ? "draw" : null;
  const scores = { ...game.scores };
  if (winner === FIVE_MARKS.BLACK || winner === FIVE_MARKS.WHITE) scores[winner] += 1;

  return {
    ...game,
    board,
    turn: opponent(mark),
    winner,
    winningLine,
    scores,
    revision: game.revision + 1,
  };
}

export function isFiveInRowState(value) {
  return Boolean(
    value
    && Array.isArray(value.board)
    && value.board.length === SIZE * SIZE
    && value.scores
    && Number.isInteger(value.revision),
  );
}

function candidateCells(board) {
  const occupied = board.map((mark, index) => mark ? index : -1).filter((index) => index >= 0);
  if (!occupied.length) return [indexAt(Math.floor(SIZE / 2), Math.floor(SIZE / 2))];
  const cells = new Set();
  for (const index of occupied) {
    const r = row(index);
    const c = column(index);
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const nextRow = r + dr;
        const nextColumn = c + dc;
        const next = indexAt(nextRow, nextColumn);
        if (inside(nextRow, nextColumn) && !board[next]) cells.add(next);
      }
    }
  }
  return [...cells];
}

function scoreCell(board, index, mark) {
  const r = row(index);
  const c = column(index);
  let score = 0;
  for (const [dr, dc] of DIRECTIONS) {
    let count = 1;
    let open = 0;
    for (const direction of [-1, 1]) {
      let nextRow = r + dr * direction;
      let nextColumn = c + dc * direction;
      while (inside(nextRow, nextColumn) && board[indexAt(nextRow, nextColumn)] === mark) {
        count += 1;
        nextRow += dr * direction;
        nextColumn += dc * direction;
      }
      if (inside(nextRow, nextColumn) && !board[indexAt(nextRow, nextColumn)]) open += 1;
    }
    score += count * count * (open + 1);
  }
  return score;
}

export function chooseFiveInRowMove(game, mark = FIVE_MARKS.WHITE) {
  if (!game || game.winner || game.turn !== mark) return -1;
  const empty = candidateCells(game.board);
  const rival = opponent(mark);

  for (const target of empty) {
    const board = [...game.board];
    board[target] = mark;
    if (findWinningLine(board, target, mark).length) return target;
  }
  for (const target of empty) {
    const board = [...game.board];
    board[target] = rival;
    if (findWinningLine(board, target, rival).length) return target;
  }

  return empty
    .map((index) => ({
      index,
      score: scoreCell(game.board, index, mark) + scoreCell(game.board, index, rival) * 0.9,
    }))
    .sort((a, b) => b.score - a.score)[0]?.index ?? -1;
}
