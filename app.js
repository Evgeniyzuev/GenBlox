const dialog = document.querySelector("#game-dialog");
const openButtons = [
  document.querySelector("#open-space"),
  document.querySelector("#join-space"),
];
const closeButton = document.querySelector("#close-game");
const nextRoundButton = document.querySelector("#next-round");
const resetScoreButton = document.querySelector("#reset-score");
const statusLabel = document.querySelector("#game-status");
const roundLabel = document.querySelector("#round-number");
const scoreXLabel = document.querySelector("#score-x");
const scoreOLabel = document.querySelector("#score-o");
const boardElement = document.querySelector("#game-board");
const cells = [...document.querySelectorAll("[data-cell]")];
const playerCards = [...document.querySelectorAll("[data-player]")];

const winningLines = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

let board = Array(9).fill("");
let currentPlayer = "X";
let round = 1;
let scores = { X: 0, O: 0 };
let roundFinished = false;

function openGame() {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeGame() {
  dialog.close();
}

function setTurn(player) {
  currentPlayer = player;
  playerCards.forEach((card) => {
    card.classList.toggle("is-turn", card.dataset.player === player);
  });
  statusLabel.textContent = player === "X" ? "Ход крестиков" : "Ход ноликов";
}

function findWinningLine() {
  return winningLines.find(([a, b, c]) => (
    board[a] && board[a] === board[b] && board[a] === board[c]
  ));
}

function finishRound(winningLine) {
  roundFinished = true;
  playerCards.forEach((card) => card.classList.remove("is-turn"));

  if (winningLine) {
    winningLine.forEach((index) => cells[index].classList.add("win"));
    scores[currentPlayer] += 1;
    scoreXLabel.textContent = scores.X;
    scoreOLabel.textContent = scores.O;
    statusLabel.textContent = currentPlayer === "X"
      ? "Крестики победили!"
      : "Нолики победили!";
  } else {
    statusLabel.textContent = "Ничья — отличный раунд!";
  }
}

function playCell(event) {
  const cell = event.currentTarget;
  const index = Number(cell.dataset.cell);

  if (roundFinished || board[index]) {
    return;
  }

  board[index] = currentPlayer;
  cell.textContent = currentPlayer === "X" ? "×" : "○";
  cell.classList.add(currentPlayer === "X" ? "mark-x" : "mark-o");
  cell.setAttribute("aria-label", `Клетка ${index + 1}: ${cell.textContent}`);

  const winningLine = findWinningLine();
  if (winningLine || board.every(Boolean)) {
    finishRound(winningLine);
    return;
  }

  setTurn(currentPlayer === "X" ? "O" : "X");
}

function startRound(incrementRound = true) {
  if (incrementRound) {
    round += 1;
  }

  board = Array(9).fill("");
  roundFinished = false;
  roundLabel.textContent = round;

  cells.forEach((cell, index) => {
    cell.textContent = "";
    cell.className = "";
    cell.setAttribute("aria-label", `Клетка ${index + 1}`);
  });

  setTurn(round % 2 === 1 ? "X" : "O");
}

function resetScore() {
  scores = { X: 0, O: 0 };
  round = 1;
  scoreXLabel.textContent = "0";
  scoreOLabel.textContent = "0";
  startRound(false);
}

openButtons.forEach((button) => button.addEventListener("click", openGame));
closeButton.addEventListener("click", closeGame);
nextRoundButton.addEventListener("click", () => startRound(true));
resetScoreButton.addEventListener("click", resetScore);
cells.forEach((cell) => cell.addEventListener("click", playCell));

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    closeGame();
  }
});

boardElement.addEventListener("keydown", (event) => {
  const activeIndex = cells.indexOf(document.activeElement);
  if (activeIndex === -1) return;

  const columns = 3;
  let nextIndex = activeIndex;
  if (event.key === "ArrowRight") nextIndex = Math.min(activeIndex + 1, 8);
  if (event.key === "ArrowLeft") nextIndex = Math.max(activeIndex - 1, 0);
  if (event.key === "ArrowDown") nextIndex = Math.min(activeIndex + columns, 8);
  if (event.key === "ArrowUp") nextIndex = Math.max(activeIndex - columns, 0);

  if (nextIndex !== activeIndex) {
    event.preventDefault();
    cells[nextIndex].focus();
  }
});
