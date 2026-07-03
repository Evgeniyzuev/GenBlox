const fleet = [3, 2, 2, 1, 1];

function createFleet(size) {
  const occupied = new Set();

  for (const length of fleet) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() > 0.5;
      const row = Math.floor(Math.random() * (horizontal ? size : size - length + 1));
      const column = Math.floor(Math.random() * (horizontal ? size - length + 1 : size));
      const cells = Array.from({ length }, (_, offset) => (
        horizontal
          ? row * size + column + offset
          : (row + offset) * size + column
      ));
      if (cells.every((cell) => !occupied.has(cell))) {
        cells.forEach((cell) => occupied.add(cell));
        placed = true;
      }
    }
  }
  return occupied;
}

export function createBattle(size = 8) {
  return {
    size,
    playerShips: createFleet(size),
    botShips: createFleet(size),
    playerShots: new Set(),
    botShots: new Set(),
    turn: "player",
    winner: null,
    lastBotShot: null,
  };
}

function fleetDestroyed(ships, shots) {
  return [...ships].every((cell) => shots.has(cell));
}

export function playerShoot(state, index) {
  if (state.winner || state.turn !== "player" || state.playerShots.has(index)) {
    return false;
  }
  state.playerShots.add(index);
  if (fleetDestroyed(state.botShips, state.playerShots)) {
    state.winner = "player";
  } else {
    state.turn = "bot";
  }
  return true;
}

export function botShoot(state) {
  if (state.winner || state.turn !== "bot") return null;
  const freeCells = Array.from(
    { length: state.size ** 2 },
    (_, index) => index,
  ).filter((index) => !state.botShots.has(index));
  const index = freeCells[Math.floor(Math.random() * freeCells.length)];
  state.botShots.add(index);
  state.lastBotShot = index;
  if (fleetDestroyed(state.playerShips, state.botShots)) {
    state.winner = "bot";
  } else {
    state.turn = "player";
  }
  return index;
}

export function opponentShoot(state, index) {
  if (
    state.winner ||
    state.turn !== "bot" ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.size ** 2 ||
    state.botShots.has(index)
  ) {
    return false;
  }
  state.botShots.add(index);
  state.lastBotShot = index;
  if (fleetDestroyed(state.playerShips, state.botShots)) {
    state.winner = "bot";
  } else {
    state.turn = "player";
  }
  return true;
}

export function serializeBattle(state) {
  if (!state) return null;
  return {
    ...state,
    playerShips: [...state.playerShips],
    botShips: [...state.botShips],
    playerShots: [...state.playerShots],
    botShots: [...state.botShots],
  };
}

export function hydrateBattle(state) {
  if (!state) return null;
  return {
    ...state,
    playerShips: new Set(state.playerShips),
    botShips: new Set(state.botShips),
    playerShots: new Set(state.playerShots),
    botShots: new Set(state.botShots),
  };
}

export function remainingDecks(ships, shots) {
  return [...ships].filter((cell) => !shots.has(cell)).length;
}
