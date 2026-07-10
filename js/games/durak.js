const SUITS = ["S", "H", "D", "C"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const HAND_LIMIT = 6;
const PLAYER_COUNT = 4;

function buildDeck() {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: `${rank}${suit}`, rank, suit })));
}

function shuffle(cards) {
  const deck = [...cards];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[target]] = [deck[target], deck[index]];
  }
  return deck;
}

function nextActive(game, from) {
  for (let step = 1; step <= PLAYER_COUNT; step += 1) {
    const index = (from + step) % PLAYER_COUNT;
    if (!game.out.includes(index)) return index;
  }
  return from;
}

function rankValue(rank) { return RANKS.indexOf(rank); }
function playerLabel(index) { return index === 0 ? "You" : `Bot ${index}`; }
function cardById(cards, id) { return cards.find((card) => card.id === id) ?? null; }
function tableCards(table) { return table.flatMap((pair) => pair.defense ? [pair.attack, pair.defense] : [pair.attack]); }

export function cardText(card) {
  if (!card) return "";
  const suit = { S: "♠", H: "♥", D: "♦", C: "♣" }[card.suit];
  return `${card.rank}${suit}`;
}

export function canBeat(attack, defense, trumpSuit) {
  if (!attack || !defense) return false;
  if (attack.suit === defense.suit && rankValue(defense.rank) > rankValue(attack.rank)) return true;
  return defense.suit === trumpSuit && attack.suit !== trumpSuit;
}

function legalAttackCards(game, playerIndex) {
  const hand = game.players[playerIndex]?.hand ?? [];
  const ranksOnTable = new Set(tableCards(game.table).map((card) => card.rank));
  if (!game.table.length) return hand;
  return hand.filter((card) => ranksOnTable.has(card.rank));
}

function legalDefenseCards(game, attackCard, playerIndex) {
  return (game.players[playerIndex]?.hand ?? []).filter((card) => canBeat(attackCard, card, game.trump.suit));
}

function drawCards(game, order) {
  const deck = [...game.deck];
  const players = game.players.map((player) => ({ ...player, hand: [...player.hand] }));
  for (const playerIndex of order) {
    if (game.out.includes(playerIndex)) continue;
    while (players[playerIndex].hand.length < HAND_LIMIT && deck.length) {
      players[playerIndex].hand.push(deck.shift());
    }
  }
  return { deck, players };
}

function refreshOut(game) {
  if (game.deck.length) return game;
  const out = [...game.out];
  game.players.forEach((player, index) => {
    if (!player.hand.length && !out.includes(index)) out.push(index);
  });
  const active = game.players.map((_, index) => index).filter((index) => !out.includes(index));
  if (active.length <= 1) {
    return { ...game, out, winner: active[0] ?? "draw", phase: "finished" };
  }
  return { ...game, out };
}

function normalizeDuel(game) {
  if (game.phase === "finished") return game;
  const attacker = game.out.includes(game.attacker) ? nextActive(game, game.attacker) : game.attacker;
  const defender = game.out.includes(game.defender) || game.defender === attacker
    ? nextActive({ ...game, attacker }, attacker)
    : game.defender;
  return { ...game, attacker, defender, turn: game.out.includes(game.turn) ? attacker : game.turn };
}

export function createDurakGame(previous = null) {
  const deck = shuffle(buildDeck());
  const trump = deck[deck.length - 1];
  const players = Array.from({ length: PLAYER_COUNT }, (_, index) => ({
    name: playerLabel(index),
    hand: deck.splice(0, HAND_LIMIT),
  }));

  const firstAttacker = players
    .map((player, index) => ({
      index,
      trump: player.hand.filter((card) => card.suit === trump.suit).sort((a, b) => rankValue(a.rank) - rankValue(b.rank))[0],
    }))
    .filter((entry) => entry.trump)
    .sort((a, b) => rankValue(a.trump.rank) - rankValue(b.trump.rank))[0]?.index ?? 0;

  return {
    kind: "durak",
    players,
    deck,
    trump,
    discard: [],
    table: [],
    attacker: firstAttacker,
    defender: (firstAttacker + 1) % PLAYER_COUNT,
    turn: firstAttacker,
    selectedAttack: null,
    out: [],
    winner: null,
    round: (previous?.round ?? 0) + 1,
    revision: (previous?.revision ?? 0) + 1,
  };
}

export function getDurakActions(game, playerIndex) {
  if (!isDurakState(game) || game.winner !== null) return { cards: [], canTake: false, canPass: false };
  if (playerIndex === game.attacker && game.turn === playerIndex) {
    return { cards: legalAttackCards(game, playerIndex), canTake: false, canPass: game.table.length > 0 && game.table.every((pair) => pair.defense) };
  }
  if (playerIndex === game.defender && game.turn === playerIndex) {
    const pair = game.table.find((entry) => !entry.defense);
    return {
      cards: pair ? legalDefenseCards(game, pair.attack, playerIndex) : [],
      canTake: game.table.some((entry) => !entry.defense),
      canPass: false,
    };
  }
  return { cards: [], canTake: false, canPass: false };
}

export function playDurakCard(game, cardId, playerIndex) {
  if (!isDurakState(game) || game.winner !== null) return game;
  const players = game.players.map((player) => ({ ...player, hand: [...player.hand] }));
  const hand = players[playerIndex]?.hand ?? [];
  const card = cardById(hand, cardId);
  if (!card) return game;

  if (playerIndex === game.attacker && game.turn === playerIndex) {
    if (!legalAttackCards(game, playerIndex).some((legal) => legal.id === cardId)) return game;
    players[playerIndex].hand = hand.filter((candidate) => candidate.id !== cardId);
    return {
      ...game,
      players,
      table: [...game.table, { attack: card, defense: null }],
      turn: game.defender,
      selectedAttack: card.id,
      revision: game.revision + 1,
    };
  }

  if (playerIndex === game.defender && game.turn === playerIndex) {
    const target = game.table.find((pair) => !pair.defense);
    if (!target || !canBeat(target.attack, card, game.trump.suit)) return game;
    players[playerIndex].hand = hand.filter((candidate) => candidate.id !== cardId);
    const table = game.table.map((pair) => pair.attack.id === target.attack.id ? { ...pair, defense: card } : pair);
    return {
      ...game,
      players,
      table,
      turn: game.attacker,
      selectedAttack: null,
      revision: game.revision + 1,
    };
  }

  return game;
}

export function passDurak(game, playerIndex) {
  if (!isDurakState(game) || playerIndex !== game.attacker || game.turn !== playerIndex) return game;
  if (!game.table.length || game.table.some((pair) => !pair.defense)) return game;
  const drawOrder = [game.attacker, game.defender, ...[0, 1, 2, 3].filter((index) => index !== game.attacker && index !== game.defender)];
  const drawn = drawCards(game, drawOrder);
  const candidate = refreshOut({
    ...game,
    ...drawn,
    discard: [...game.discard, ...tableCards(game.table)],
    table: [],
    attacker: game.defender,
    defender: nextActive({ ...game, out: game.out }, game.defender),
    turn: game.defender,
    selectedAttack: null,
    revision: game.revision + 1,
  });
  if (candidate.phase === "finished") return candidate;
  return normalizeDuel({ ...candidate, defender: nextActive(candidate, candidate.attacker) });
}

export function takeDurak(game, playerIndex) {
  if (!isDurakState(game) || playerIndex !== game.defender || game.turn !== playerIndex) return game;
  if (!game.table.some((pair) => !pair.defense)) return game;
  const players = game.players.map((player) => ({ ...player, hand: [...player.hand] }));
  players[playerIndex].hand.push(...tableCards(game.table));
  const nextAttacker = nextActive(game, playerIndex);
  const drawOrder = [game.attacker, ...[0, 1, 2, 3].filter((index) => index !== game.attacker)];
  const drawn = drawCards({ ...game, players }, drawOrder);
  const candidate = refreshOut({
    ...game,
    ...drawn,
    table: [],
    attacker: nextAttacker,
    defender: nextActive({ ...game, out: game.out }, nextAttacker),
    turn: nextAttacker,
    selectedAttack: null,
    revision: game.revision + 1,
  });
  if (candidate.phase === "finished") return candidate;
  return normalizeDuel({ ...candidate, defender: nextActive(candidate, candidate.attacker) });
}

export function chooseDurakBotAction(game, playerIndex) {
  const actions = getDurakActions(game, playerIndex);
  if (actions.cards.length) {
    const sorted = [...actions.cards].sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
    return { type: "card", cardId: sorted[0].id };
  }
  if (actions.canPass) return { type: "pass" };
  if (actions.canTake) return { type: "take" };
  return null;
}

export function isDurakState(value) {
  return Boolean(
    value
    && value.kind === "durak"
    && Array.isArray(value.players)
    && value.players.length === PLAYER_COUNT
    && Array.isArray(value.deck)
    && Array.isArray(value.table)
    && value.trump
    && Number.isInteger(value.revision),
  );
}
