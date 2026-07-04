import { PlayroomClient } from "./core/playroom-client.js";
import { createGame, isGameState, playMove } from "./games/tic-tac-toe.js";

const elements = {
  play: document.querySelector("#play-button"),
  dialog: document.querySelector("#game-dialog"),
  close: document.querySelector("#close-game"),
  board: document.querySelector("#game-board"),
  status: document.querySelector("#game-status"),
  role: document.querySelector("#role-label"),
  players: document.querySelector("#players-label"),
  scoreX: document.querySelector("#score-x"),
  scoreO: document.querySelector("#score-o"),
  newRound: document.querySelector("#new-round"),
  cards: [...document.querySelectorAll(".player-card")],
};

let client = null;
let lastRevision = -1;
let lastPlayerCount = -1;
let renderTimer = null;

function buildBoard() {
  elements.board.replaceChildren();
  for (let index = 0; index < 9; index += 1) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    cell.dataset.index = index;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Клетка ${index + 1}`);
    cell.addEventListener("click", () => makeMove(index));
    elements.board.append(cell);
  }
}

async function startGame() {
  elements.play.disabled = true;
  elements.play.textContent = "Открываем Playroom…";

  try {
    client ??= new PlayroomClient();
    await client.start();

    if (client.isHost && !isGameState(client.getState())) {
      client.setState(createGame());
    }

    elements.role.textContent = client.isHost ? "Ты играешь за ×" : "Ты играешь за ○";
    elements.newRound.hidden = !client.isHost;
    elements.dialog.showModal();
    startRendering();
  } catch (error) {
    console.error(error);
    alert(error instanceof Error ? error.message : "Не удалось открыть Playroom.");
  } finally {
    elements.play.disabled = false;
    elements.play.textContent = "Играть онлайн";
  }
}

function makeMove(index) {
  const current = client?.getState();
  if (!isGameState(current) || client.playerCount < 2) return;
  const next = playMove(current, index, client.mark);
  if (next !== current) client.setState(next);
}

function startRendering() {
  clearInterval(renderTimer);
  renderCurrentState();
  renderTimer = setInterval(renderCurrentState, 120);
}

function renderCurrentState() {
  if (!client) return;
  const game = client.getState();
  const playerCount = client.playerCount;
  elements.players.textContent = `Игроков: ${Math.min(playerCount, 2)} / 2`;

  if (!isGameState(game)) {
    elements.status.textContent = "Создаём игровое поле…";
    return;
  }

  if (game.revision === lastRevision && playerCount === lastPlayerCount) return;
  lastRevision = game.revision;
  lastPlayerCount = playerCount;

  [...elements.board.children].forEach((cell, index) => {
    const mark = game.board[index];
    cell.textContent = mark === "X" ? "×" : mark === "O" ? "○" : "";
    cell.className = `cell${mark ? ` mark-${mark.toLowerCase()}` : ""}${game.winningLine.includes(index) ? " is-win" : ""}`;
    cell.disabled = Boolean(mark || game.winner || playerCount < 2 || game.turn !== client.mark);
  });

  elements.scoreX.textContent = game.scores.X;
  elements.scoreO.textContent = game.scores.O;
  elements.cards.forEach((card) => card.classList.toggle("is-turn", !game.winner && card.dataset.player === game.turn));

  if (playerCount < 2) elements.status.textContent = "Ждём второго игрока…";
  else if (game.winner === "draw") elements.status.textContent = "Ничья!";
  else if (game.winner) elements.status.textContent = game.winner === client.mark ? "Ты победил!" : "Победил соперник";
  else elements.status.textContent = game.turn === client.mark ? "Твой ход" : "Ход соперника";
}

elements.play.addEventListener("click", startGame);
elements.close.addEventListener("click", () => elements.dialog.close());
elements.newRound.addEventListener("click", () => {
  const current = client?.getState();
  if (client?.isHost && isGameState(current)) client.setState(createGame(current));
});

buildBoard();
