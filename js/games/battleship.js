export const fleet = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];

function placementCells(size, start, length, horizontal) {
  const row = Math.floor(start / size);
  const column = start % size;
  if (horizontal && column + length > size) return null;
  if (!horizontal && row + length > size) return null;
  return Array.from({ length }, (_, offset) => (
    horizontal ? start + offset : start + offset * size
  ));
}

function touchesExisting(size, occupied, cells) {
  const candidate = new Set(cells);
  return cells.some((cell) => {
    const row = Math.floor(cell / size);
    const column = cell % size;
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        if (
          nextRow >= 0 &&
          nextRow < size &&
          nextColumn >= 0 &&
          nextColumn < size
        ) {
          const neighbour = nextRow * size + nextColumn;
          if (occupied.has(neighbour) && !candidate.has(neighbour)) return true;
        }
      }
    }
    return false;
  });
}

export function tryPlaceShip(occupied, size, start, length, horizontal) {
  const cells = placementCells(size, start, length, horizontal);
  if (
    !cells ||
    cells.some((cell) => occupied.has(cell)) ||
    touchesExisting(size, occupied, cells)
  ) {
    return null;
  }
  return cells;
}

export function createFleet(size) {
  const occupied = new Set();

  for (const length of fleet) {
    let placed = false;
    while (!placed) {
      const horizontal = Math.random() > 0.5;
      const start = Math.floor(Math.random() * size * size);
      const cells = tryPlaceShip(occupied, size, start, length, horizontal);
      if (cells) {
        cells.forEach((cell) => occupied.add(cell));
        placed = true;
      }
    }
  }
  return occupied;
}

export function createBattle(size = 10, playerFleet = null, opponentFleet = null) {
  return {
    size,
    playerShips: new Set(playerFleet || createFleet(size)),
    botShips: new Set(opponentFleet || createFleet(size)),
    playerShots: new Set(),
    botShots: new Set(),
    turn: "player",
    winner: null,
    lastBotShot: null,
  };
}

export function isCompleteFleet(ships) {
  return ships instanceof Set && ships.size === 20;
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
