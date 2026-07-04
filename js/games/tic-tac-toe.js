export const MARKS = Object.freeze({ HOST: "X", GUEST: "O" });

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function createGame(previous = null) {
  const round = (previous?.round ?? 0) + 1;
  const starter = round % 2 === 1 ? MARKS.HOST : MARKS.GUEST;

  return {
    board: Array(9).fill(""),
    turn: starter,
    starter,
    winner: null,
    winningLine: [],
    round,
    scores: previous?.scores ?? { X: 0, O: 0 },
    revision: (previous?.revision ?? 0) + 1,
  };
}

export function playMove(game, index, mark) {
  if (!game || game.winner || game.turn !== mark || game.board[index]) return game;

  const board = [...game.board];
  board[index] = mark;
  const winningLine = WINNING_LINES.find((line) => line.every((cell) => board[cell] === mark)) ?? [];
  const winner = winningLine.length ? mark : board.every(Boolean) ? "draw" : null;
  const scores = { ...game.scores };
  if (winner === MARKS.HOST || winner === MARKS.GUEST) scores[winner] += 1;

  return {
    ...game,
    board,
    turn: mark === MARKS.HOST ? MARKS.GUEST : MARKS.HOST,
    winner,
    winningLine,
    scores,
    revision: game.revision + 1,
  };
}

export function isGameState(value) {
  return Boolean(
    value
    && Array.isArray(value.board)
    && value.board.length === 9
    && value.scores
    && Number.isInteger(value.revision),
  );
}

export function chooseComputerMove(game) {
  if (!game || game.winner || game.turn !== MARKS.GUEST) return -1;
  const empty = game.board.map((mark, index) => mark ? -1 : index).filter((index) => index >= 0);

  const completesLine = (mark) => empty.find((index) => {
    const board = [...game.board];
    board[index] = mark;
    return WINNING_LINES.some((line) => line.every((cell) => board[cell] === mark));
  });

  return completesLine(MARKS.GUEST)
    ?? completesLine(MARKS.HOST)
    ?? (empty.includes(4) ? 4 : undefined)
    ?? [0, 2, 6, 8].find((index) => empty.includes(index))
    ?? empty[0]
    ?? -1;
}
