const SUITS = ["S", "H", "D", "C"];
const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const HAND_LIMIT = 6;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;

export const DURAK_PLAYER_RANGE = Object.freeze({ MIN: MIN_PLAYERS, MAX: MAX_PLAYERS });
export const DEFAULT_DURAK_OPTIONS = Object.freeze({
  playerCount: 4,
  throwIn: false,
  transferable: false,
  matchTarget: 1,
});

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.parseInt(value, 10) || min));
}

export function normalizeDurakOptions(options = {}) {
  return {
    playerCount: clamp(options.playerCount ?? DEFAULT_DURAK_OPTIONS.playerCount, MIN_PLAYERS, MAX_PLAYERS),
    throwIn: Boolean(options.throwIn ?? DEFAULT_DURAK_OPTIONS.throwIn),
    transferable: Boolean(options.transferable ?? DEFAULT_DURAK_OPTIONS.transferable),
    matchTarget: clamp(options.matchTarget ?? DEFAULT_DURAK_OPTIONS.matchTarget, 1, 9),
  };
}

function playerCount(game) { return game.players?.length ?? DEFAULT_DURAK_OPTIONS.playerCount; }

function nextActive(game, from) {
  const count = playerCount(game);
  for (let step = 1; step <= count; step += 1) {
    const index = (from + step) % count;
    if (!game.out.includes(index)) return index;
  }
  return from;
}

function rankValue(rank) { return RANKS.indexOf(rank); }
function playerLabel(index) { return index === 0 ? "You" : `Bot ${index}`; }
function cardById(cards, id) { return cards.find((card) => card.id === id) ?? null; }
function tableCards(table) { return table.flatMap((pair) => pair.defense ? [pair.attack, pair.defense] : [pair.attack]); }
function activeIndexes(game) {
  return game.players.map((_, index) => index).filter((index) => !game.out.includes(index));
}
function attackLimit(game) {
  if (game.taking) return HAND_LIMIT;
  return Math.min(HAND_LIMIT, game.defenderHandAtStart ?? game.players[game.defender]?.hand.length ?? HAND_LIMIT);
}

function legalTransferCards(game, playerIndex) {
  if (!game.options.transferable || playerIndex !== game.defender || game.taking) return [];
  if (!game.table.length || game.table.some((pair) => pair.defense)) return [];
  const nextDefender = nextActive(game, playerIndex);
  if (nextDefender === playerIndex || game.table.length >= Math.min(HAND_LIMIT, game.players[nextDefender]?.hand.length ?? 0)) return [];
  const attackRank = game.table.find((pair) => !pair.defense)?.attack.rank;
  return (game.players[playerIndex]?.hand ?? []).filter((card) => card.rank === attackRank);
}

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
  if (game.out.includes(playerIndex) || playerIndex === game.defender) return [];
  if ((game.players[game.defender]?.hand.length ?? 0) === 0) return [];
  if (game.table.length >= attackLimit(game)) return [];
  if (!game.table.length) return playerIndex === game.attacker ? hand : [];
  const ranksOnTable = new Set(tableCards(game.table).map((card) => card.rank));
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

function scoreFinishedRound(game) {
  const loser = activeIndexes(game)[0] ?? null;
  const scores = [...(game.scores ?? Array(playerCount(game)).fill(0))];
  if (loser !== null) {
    scores.forEach((score, index) => {
      if (index !== loser) scores[index] = score + 1;
    });
  }
  const matchWinner = scores.findIndex((score) => score >= game.options.matchTarget);
  return {
    ...game,
    scores,
    winner: loser ?? "draw",
    matchWinner: matchWinner >= 0 ? matchWinner : null,
    phase: "finished",
  };
}

function refreshOut(game) {
  if (game.deck.length) return game;
  const out = [...game.out];
  game.players.forEach((player, index) => {
    if (!player.hand.length && !out.includes(index)) out.push(index);
  });
  const active = game.players.map((_, index) => index).filter((index) => !out.includes(index));
  if (active.length <= 1) return scoreFinishedRound({ ...game, out });
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

function throwerCandidates(game, from) {
  if (!game.options.throwIn || !game.table.length || (!game.taking && game.table.some((pair) => !pair.defense))) return [];
  const count = playerCount(game);
  const candidates = [];
  for (let step = 1; step <= count; step += 1) {
    const index = (from + step) % count;
    if (
      index !== game.defender
      && !game.out.includes(index)
      && !game.passedThrowers.includes(index)
      && legalAttackCards(game, index).length
    ) {
      candidates.push(index);
    }
  }
  return candidates;
}

function completeTake(game) {
  const players = game.players.map((player) => ({ ...player, hand: [...player.hand] }));
  players[game.defender].hand.push(...tableCards(game.table));
  const nextAttacker = nextActive(game, game.defender);
  const count = playerCount(game);
  const drawOrder = [game.attacker, ...Array.from({ length: count }, (_, index) => index).filter((index) => index !== game.attacker)];
  const drawn = drawCards({ ...game, players }, drawOrder);
  const candidate = refreshOut({
    ...game, ...drawn, table: [], attacker: nextAttacker,
    defender: nextActive({ ...game, out: game.out }, nextAttacker), turn: nextAttacker,
    selectedAttack: null, defenderHandAtStart: null, passedThrowers: [], taking: false,
    revision: game.revision + 1,
  });
  if (candidate.phase === "finished") return candidate;
  return normalizeDuel({ ...candidate, defender: nextActive(candidate, candidate.attacker) });
}

function afterSuccessfulDefense(game, defenderIndex) {
  if (game.table.length >= attackLimit(game)) return completeDefense(game);
  const attackerHasCards = (game.players[game.attacker]?.hand.length ?? 0) > 0;
  if (!game.options.throwIn) {
    return attackerHasCards
      ? {
          ...game,
          turn: game.attacker,
        }
      : completeDefense(game);
  }

  const withEmptyAttackerSkipped = attackerHasCards || game.passedThrowers.includes(game.attacker)
    ? game
    : {
        ...game,
        passedThrowers: [...new Set([...(game.passedThrowers ?? []), game.attacker])],
      };

  if (attackerHasCards && !withEmptyAttackerSkipped.passedThrowers.includes(game.attacker)) {
    return {
      ...withEmptyAttackerSkipped,
      turn: game.attacker,
    };
  }
  const nextThrower = throwerCandidates(withEmptyAttackerSkipped, defenderIndex)[0];
  if (nextThrower === undefined) return completeDefense(withEmptyAttackerSkipped);
  return {
    ...withEmptyAttackerSkipped,
    turn: nextThrower,
  };
}

function completeDefense(game) {
  const count = playerCount(game);
  const otherPlayers = Array.from({ length: count }, (_, index) => index)
    .filter((index) => index !== game.attacker && index !== game.defender);
  const drawOrder = [game.attacker, game.defender, ...otherPlayers];
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
    defenderHandAtStart: null,
    passedThrowers: [],
    taking: false,
    revision: game.revision + 1,
  });
  if (candidate.phase === "finished") return candidate;
  return normalizeDuel({ ...candidate, defender: nextActive(candidate, candidate.attacker) });
}

export function createDurakGame(previous = null, rawOptions = null) {
  const options = normalizeDurakOptions(rawOptions ?? previous?.options ?? DEFAULT_DURAK_OPTIONS);
  const deck = shuffle(buildDeck());
  const trump = deck[deck.length - 1];
  const players = Array.from({ length: options.playerCount }, (_, index) => ({
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
    options,
    players,
    deck,
    trump,
    discard: [],
    table: [],
    attacker: firstAttacker,
    defender: (firstAttacker + 1) % options.playerCount,
    turn: firstAttacker,
    selectedAttack: null,
    defenderHandAtStart: null,
    passedThrowers: [],
    taking: false,
    out: [],
    scores: previous?.scores?.length === options.playerCount ? previous.scores : Array(options.playerCount).fill(0),
    winner: null,
    matchWinner: null,
    round: (previous?.round ?? 0) + 1,
    revision: (previous?.revision ?? 0) + 1,
  };
}

export function getDurakActions(game, playerIndex) {
  if (!isDurakState(game) || game.winner !== null || playerIndex === null) {
    return { cards: [], defenseCardIds: [], transferCardIds: [], canTake: false, canPass: false };
  }
  if (playerIndex === game.defender && game.turn === playerIndex) {
    const pair = game.table.find((entry) => !entry.defense);
    const defenseCards = pair ? legalDefenseCards(game, pair.attack, playerIndex) : [];
    const transferCards = pair ? legalTransferCards(game, playerIndex) : [];
    return {
      cards: [...new Map([...defenseCards, ...transferCards].map((card) => [card.id, card])).values()],
      defenseCardIds: defenseCards.map((card) => card.id),
      transferCardIds: transferCards.map((card) => card.id),
      canTake: game.table.some((entry) => !entry.defense),
      canPass: false,
    };
  }
  if (game.turn === playerIndex) {
    return {
      cards: legalAttackCards(game, playerIndex),
      canTake: false,
      canPass: game.table.length > 0 && (game.taking || game.table.every((pair) => pair.defense)),
    };
  }
  return { cards: [], canTake: false, canPass: false };
}

export function playDurakCard(game, cardId, playerIndex, intent = null) {
  if (!isDurakState(game) || game.winner !== null || game.turn !== playerIndex) return game;
  const players = game.players.map((player) => ({ ...player, hand: [...player.hand] }));
  const hand = players[playerIndex]?.hand ?? [];
  const card = cardById(hand, cardId);
  if (!card) return game;

  if (playerIndex !== game.defender) {
    if (!legalAttackCards(game, playerIndex).some((legal) => legal.id === cardId)) return game;
    players[playerIndex].hand = hand.filter((candidate) => candidate.id !== cardId);
    const startsBattle = game.table.length === 0;
    const attacked = {
      ...game,
      players,
      table: [...game.table, { attack: card, defense: null }],
      turn: game.taking ? playerIndex : game.defender,
      selectedAttack: card.id,
      defenderHandAtStart: startsBattle ? game.players[game.defender]?.hand.length ?? HAND_LIMIT : game.defenderHandAtStart,
      passedThrowers: startsBattle ? [] : game.passedThrowers,
      revision: game.revision + 1,
    };
    if (game.taking && attacked.table.length >= attackLimit(attacked)) return completeTake(attacked);
    return attacked;
  }

  const target = game.table.find((pair) => !pair.defense);
  const canTransfer = target && legalTransferCards(game, playerIndex).some((legal) => legal.id === cardId);
  const canDefend = target && canBeat(target.attack, card, game.trump.suit);
  if (canTransfer && intent !== "defend") {
    const newDefender = nextActive(game, playerIndex);
    players[playerIndex].hand = hand.filter((candidate) => candidate.id !== cardId);
    return {
      ...game, players, table: [...game.table, { attack: card, defense: null }],
      attacker: playerIndex, defender: newDefender, turn: newDefender,
      defenderHandAtStart: game.players[newDefender]?.hand.length ?? HAND_LIMIT,
      selectedAttack: card.id, passedThrowers: [], revision: game.revision + 1,
    };
  }
  if (!canDefend || intent === "transfer") return game;
  players[playerIndex].hand = hand.filter((candidate) => candidate.id !== cardId);
  const table = game.table.map((pair) => pair.attack.id === target.attack.id ? { ...pair, defense: card } : pair);
  const defended = {
    ...game,
    players,
    table,
    selectedAttack: null,
    revision: game.revision + 1,
  };

  if (table.some((pair) => !pair.defense)) return { ...defended, turn: playerIndex };
  return players[playerIndex].hand.length === 0 ? completeDefense(defended) : afterSuccessfulDefense(defended, playerIndex);
}

export function passDurak(game, playerIndex) {
  if (!isDurakState(game) || playerIndex === game.defender || game.turn !== playerIndex) return game;
  if (!game.table.length || (!game.taking && game.table.some((pair) => !pair.defense))) return game;

  const passed = [...new Set([...(game.passedThrowers ?? []), playerIndex])];
  const withPass = { ...game, passedThrowers: passed };
  const nextThrower = throwerCandidates(withPass, playerIndex)[0];
  if (nextThrower !== undefined) {
    return {
      ...withPass,
      turn: nextThrower,
      revision: game.revision + 1,
    };
  }
  return game.taking ? completeTake(withPass) : completeDefense(withPass);
}

export function takeDurak(game, playerIndex) {
  if (!isDurakState(game) || playerIndex !== game.defender || game.turn !== playerIndex) return game;
  if (!game.table.some((pair) => !pair.defense)) return game;
  const taking = { ...game, taking: true, turn: game.attacker, passedThrowers: [], revision: game.revision + 1 };
  return legalAttackCards(taking, game.attacker).length ? taking : completeTake(taking);
}

export function chooseDurakBotAction(game, playerIndex) {
  const actions = getDurakActions(game, playerIndex);
  if (actions.cards.length) {
    const sorted = [...actions.cards].sort((a, b) => rankValue(a.rank) - rankValue(b.rank));
    const cardId = sorted[0].id;
    const canDefend = actions.defenseCardIds?.includes(cardId);
    return { type: "card", cardId, intent: canDefend ? "defend" : "transfer" };
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
    && value.players.length >= MIN_PLAYERS
    && value.players.length <= MAX_PLAYERS
    && Array.isArray(value.deck)
    && Array.isArray(value.table)
    && value.trump
    && Number.isInteger(value.revision),
  );
}
