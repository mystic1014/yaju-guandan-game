export const SUITS = ["♠", "♥", "♣", "♦"] as const;
export const STANDARD_RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;

export type Suit = (typeof SUITS)[number];
export type StandardRank = (typeof STANDARD_RANKS)[number];
export type Rank = StandardRank | "SJ" | "BJ";
export type Difficulty = "casual" | "standard" | "expert";
export type GamePhase = "playing" | "tribute" | "roundEnd" | "matchEnd";

export interface Card {
  id: string;
  rank: Rank;
  suit: Suit | null;
  deck: 0 | 1;
}

export type PatternType =
  | "single"
  | "pair"
  | "triple"
  | "fullHouse"
  | "straight"
  | "consecutivePairs"
  | "consecutiveTriples"
  | "straightFlush"
  | "bomb"
  | "jokerBomb";

export interface HandPattern {
  type: PatternType;
  cards: Card[];
  mainRank: StandardRank | "SJ" | "BJ";
  sequenceIndex?: number;
  bombSize?: number;
  label: string;
}

export interface PlayerState {
  id: number;
  name: string;
  team: 0 | 1;
  seat: "bottom" | "left" | "top" | "right";
  isHuman: boolean;
  hand: Card[];
  finished: boolean;
  online: boolean;
  autoPlay: boolean;
}

export interface PlayedHand {
  playerId: number;
  pattern: HandPattern;
  cards: Card[];
  turn: number;
}

export interface TributeState {
  donors: number[];
  receivers: number[];
  anti: boolean;
  summary: string;
}

export interface RoundState {
  phase: GamePhase;
  currentPlayer: number;
  leaderPlayer: number;
  lastPlay: PlayedHand | null;
  passCount: number;
  finishOrder: number[];
  history: PlayedHand[];
  turn: number;
  statusMessage: string;
  tribute: TributeState | null;
}

export interface MatchState {
  schemaVersion: 1;
  seed: number;
  difficulty: Difficulty;
  roundNumber: number;
  currentLevel: StandardRank;
  teamLevels: [StandardRank, StandardRank];
  players: PlayerState[];
  round: RoundState;
  previousFinishOrder: number[];
  lastWinnerTeam: 0 | 1 | null;
  matchWinner: 0 | 1 | null;
  animationEnabled: boolean;
  soundEnabled: boolean;
}

export type GameAction =
  | { type: "PLAY"; playerId: number; cardIds: string[] }
  | { type: "PASS"; playerId: number }
  | { type: "RESOLVE_TRIBUTE" }
  | { type: "NEXT_ROUND"; seed?: number };

export interface RuleResult {
  ok: boolean;
  state: MatchState;
  error?: string;
}

export interface AiObservation {
  playerId: number;
  team: 0 | 1;
  ownHand: Card[];
  currentLevel: StandardRank;
  lastPlay: PlayedHand | null;
  teammateRemaining: number;
  opponentRemaining: number[];
  publicHistory: PlayedHand[];
  difficulty: Difficulty;
  seed: number;
}

export interface SavedGame {
  schemaVersion: 1;
  savedAt: string;
  match: MatchState;
}

const PLAYER_NAMES = ["南风知意", "山高水长", "清风揽月", "墨染流年"];
// Player ids advance 0 → 1 → 2 → 3. Map that sequence around the
// visible table clockwise: bottom → right → top → left.
const SEATS: PlayerState["seat"][] = ["bottom", "right", "top", "left"];
const GROUP_LABELS: Record<PatternType, string> = {
  single: "单张",
  pair: "对子",
  triple: "三同张",
  fullHouse: "三带二",
  straight: "顺子",
  consecutivePairs: "三连对",
  consecutiveTriples: "钢板",
  straightFlush: "同花顺",
  bomb: "炸弹",
  jokerBomb: "四王炸",
};

const STRAIGHT_SEQUENCES: StandardRank[][] = [
  ["A", "2", "3", "4", "5"],
  ["3", "4", "5", "6", "7"],
  ["4", "5", "6", "7", "8"],
  ["5", "6", "7", "8", "9"],
  ["6", "7", "8", "9", "10"],
  ["7", "8", "9", "10", "J"],
  ["8", "9", "10", "J", "Q"],
  ["9", "10", "J", "Q", "K"],
  ["10", "J", "Q", "K", "A"],
];

const PAIR_SEQUENCES: StandardRank[][] = [
  ["2", "3", "4"],
  ["3", "4", "5"],
  ["4", "5", "6"],
  ["5", "6", "7"],
  ["6", "7", "8"],
  ["7", "8", "9"],
  ["8", "9", "10"],
  ["9", "10", "J"],
  ["10", "J", "Q"],
  ["J", "Q", "K"],
  ["Q", "K", "A"],
];

const TRIPLE_SEQUENCES: StandardRank[][] = [
  ["2", "3"],
  ["3", "4"],
  ["4", "5"],
  ["5", "6"],
  ["6", "7"],
  ["7", "8"],
  ["8", "9"],
  ["9", "10"],
  ["10", "J"],
  ["J", "Q"],
  ["Q", "K"],
  ["K", "A"],
];

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const deck of [0, 1] as const) {
    for (const rank of STANDARD_RANKS) {
      for (const suit of SUITS) {
        cards.push({ id: `${deck}-${rank}-${suit}`, rank, suit, deck });
      }
    }
    cards.push({ id: `${deck}-SJ`, rank: "SJ", suit: null, deck });
    cards.push({ id: `${deck}-BJ`, rank: "BJ", suit: null, deck });
  }
  return cards;
}

function randomFactory(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleDeck(cards: Card[], seed: number): Card[] {
  const result = cards.map((card) => ({ ...card }));
  const random = randomFactory(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function isWild(card: Card, level: StandardRank): boolean {
  return card.rank === level && card.suit === "♥";
}

export function rankStrength(rank: Rank, level: StandardRank): number {
  if (rank === "BJ") return 18;
  if (rank === "SJ") return 17;
  if (rank === level) return 16;
  const base = STANDARD_RANKS.indexOf(rank);
  return base < 0 ? 0 : base + 2;
}

export function sortHand(cards: Card[], level: StandardRank): Card[] {
  return [...cards].sort((left, right) => {
    const strength = rankStrength(right.rank, level) - rankStrength(left.rank, level);
    if (strength !== 0) return strength;
    return SUITS.indexOf(right.suit as Suit) - SUITS.indexOf(left.suit as Suit);
  });
}

function countRanks(ranks: StandardRank[]) {
  const counts = new Map<StandardRank, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  return counts;
}

function sequenceMatch(ranks: StandardRank[], sequences: StandardRank[][]) {
  const sorted = [...ranks].sort();
  return sequences.findIndex(
    (sequence) => [...sequence].sort().join("|") === sorted.join("|"),
  );
}

function makePattern(
  type: PatternType,
  cards: Card[],
  mainRank: HandPattern["mainRank"],
  extras: Partial<HandPattern> = {},
): HandPattern {
  return {
    type,
    cards,
    mainRank,
    label: type === "bomb" ? `${cards.length}张炸弹` : GROUP_LABELS[type],
    ...extras,
  };
}

interface AssignedCard {
  card: Card;
  rank: StandardRank;
}

function expandWildAssignments(cards: Card[], level: StandardRank): AssignedCard[][] {
  let variants: AssignedCard[][] = [[]];
  for (const card of cards) {
    if (card.rank === "SJ" || card.rank === "BJ") return [];
    const choices = isWild(card, level) ? [...STANDARD_RANKS] : [card.rank];
    variants = variants.flatMap((variant) =>
      choices.map((rank) => [...variant, { card, rank }]),
    );
  }
  return variants;
}

function patternPriority(pattern: HandPattern, level: StandardRank): number {
  const base: Record<PatternType, number> = {
    single: 1,
    pair: 2,
    triple: 3,
    fullHouse: 4,
    straight: 5,
    consecutivePairs: 6,
    consecutiveTriples: 7,
    bomb: 20 + (pattern.bombSize ?? 4),
    straightFlush: 26,
    jokerBomb: 40,
  };
  return base[pattern.type] * 100 + rankStrength(pattern.mainRank, level);
}

function evaluateAssignment(
  assigned: AssignedCard[],
  cards: Card[],
  level: StandardRank,
): HandPattern[] {
  const ranks = assigned.map((item) => item.rank);
  const counts = countRanks(ranks);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const results: HandPattern[] = [];

  if (groups.length === 1 && cards.length >= 4) {
    results.push(
      makePattern("bomb", cards, groups[0][0], { bombSize: cards.length }),
    );
  }
  if (cards.length === 5) {
    const straightIndex = sequenceMatch(ranks, STRAIGHT_SEQUENCES);
    if (straightIndex >= 0) {
      const highRank = STRAIGHT_SEQUENCES[straightIndex].at(-1) ?? "5";
      results.push(
        makePattern("straight", cards, highRank, { sequenceIndex: straightIndex }),
      );
      const suits = new Set(
        cards
        .filter((card) => !isWild(card, level))
        .filter((card) => card.suit !== null)
        .map((card) => card.suit),
      );
      if (suits.size <= 1) {
        results.push(
          makePattern("straightFlush", cards, highRank, {
            sequenceIndex: straightIndex,
          }),
        );
      }
    }
    if (groups.length === 2 && groups[0][1] === 3 && groups[1][1] === 2) {
      results.push(makePattern("fullHouse", cards, groups[0][0]));
    }
  }
  if (cards.length === 6 && groups.length === 3 && groups.every((group) => group[1] === 2)) {
    const index = sequenceMatch(
      groups.map((group) => group[0]),
      PAIR_SEQUENCES,
    );
    if (index >= 0) {
      results.push(
        makePattern("consecutivePairs", cards, PAIR_SEQUENCES[index][2], {
          sequenceIndex: index,
        }),
      );
    }
  }
  if (cards.length === 6 && groups.length === 2 && groups.every((group) => group[1] === 3)) {
    const index = sequenceMatch(
      groups.map((group) => group[0]),
      TRIPLE_SEQUENCES,
    );
    if (index >= 0) {
      results.push(
        makePattern("consecutiveTriples", cards, TRIPLE_SEQUENCES[index][1], {
          sequenceIndex: index,
        }),
      );
    }
  }
  if (cards.length === 3 && groups.length === 1) {
    results.push(makePattern("triple", cards, groups[0][0]));
  }
  if (cards.length === 2 && groups.length === 1) {
    results.push(makePattern("pair", cards, groups[0][0]));
  }
  if (cards.length === 1) {
    results.push(makePattern("single", cards, groups[0][0]));
  }
  return results;
}

export function classifyHand(cards: Card[], level: StandardRank): HandPattern | null {
  if (cards.length === 0) return null;
  if (cards.length === 4 && cards.every((card) => card.rank === "SJ" || card.rank === "BJ")) {
    return makePattern("jokerBomb", cards, "BJ", { bombSize: 4 });
  }
  if (cards.some((card) => card.rank === "SJ" || card.rank === "BJ")) {
    if (cards.length === 1) {
      return makePattern("single", cards, cards[0].rank as "SJ" | "BJ");
    }
    if (
      cards.length === 2 &&
      cards[0].rank === cards[1].rank &&
      (cards[0].rank === "SJ" || cards[0].rank === "BJ")
    ) {
      return makePattern("pair", cards, cards[0].rank);
    }
    return null;
  }
  const patterns = expandWildAssignments(cards, level).flatMap((assignment) =>
    evaluateAssignment(assignment, cards, level),
  );
  return (
    patterns.sort(
      (left, right) => patternPriority(right, level) - patternPriority(left, level),
    )[0] ?? null
  );
}

function bombTier(pattern: HandPattern): number {
  if (pattern.type === "jokerBomb") return 100;
  if (pattern.type === "straightFlush") return 55;
  if (pattern.type === "bomb") return (pattern.bombSize ?? 4) * 10;
  return 0;
}

export function comparePatterns(
  candidate: HandPattern,
  target: HandPattern,
  level: StandardRank,
): number | null {
  const candidateBomb = bombTier(candidate);
  const targetBomb = bombTier(target);
  if (candidateBomb || targetBomb) {
    if (candidateBomb !== targetBomb) return candidateBomb - targetBomb;
    if (candidate.type === "straightFlush" && target.type === "straightFlush") {
      return (candidate.sequenceIndex ?? 0) - (target.sequenceIndex ?? 0);
    }
    return rankStrength(candidate.mainRank, level) - rankStrength(target.mainRank, level);
  }
  if (candidate.type !== target.type || candidate.cards.length !== target.cards.length) {
    return null;
  }
  if (candidate.sequenceIndex !== undefined || target.sequenceIndex !== undefined) {
    return (candidate.sequenceIndex ?? 0) - (target.sequenceIndex ?? 0);
  }
  return rankStrength(candidate.mainRank, level) - rankStrength(target.mainRank, level);
}

export function canBeat(
  candidate: HandPattern,
  target: HandPattern | null,
  level: StandardRank,
): boolean {
  if (!target) return true;
  const comparison = comparePatterns(candidate, target, level);
  return comparison !== null && comparison > 0;
}

function pickForCounts(
  hand: Card[],
  requirements: Array<{ rank: StandardRank; count: number; suit?: Suit }>,
  level: StandardRank,
): Card[] | null {
  const picked: Card[] = [];
  const used = new Set<string>();
  for (const requirement of requirements) {
    const naturals = hand.filter(
      (card) =>
        !used.has(card.id) &&
        card.rank === requirement.rank &&
        (!requirement.suit || card.suit === requirement.suit) &&
        !isWild(card, level),
    );
    const take = naturals.slice(0, requirement.count);
    take.forEach((card) => used.add(card.id));
    picked.push(...take);
    const missing = requirement.count - take.length;
    if (missing > 0) {
      const wilds = hand
        .filter((card) => !used.has(card.id) && isWild(card, level))
        .slice(0, missing);
      if (wilds.length !== missing) return null;
      wilds.forEach((card) => used.add(card.id));
      picked.push(...wilds);
    }
  }
  return picked;
}

export function getLegalMoves(
  hand: Card[],
  target: HandPattern | null,
  level: StandardRank,
): Card[][] {
  const candidates: Card[][] = hand.map((card) => [card]);
  const wilds = hand.filter((card) => isWild(card, level));

  for (const rank of STANDARD_RANKS) {
    const group = hand.filter((card) => card.rank === rank && !isWild(card, level));
    const available = [...group, ...wilds];
    for (let count = 2; count <= Math.min(10, available.length); count += 1) {
      candidates.push(available.slice(0, count));
    }
  }

  for (const sequence of STRAIGHT_SEQUENCES) {
    const straight = pickForCounts(
      hand,
      sequence.map((rank) => ({ rank, count: 1 })),
      level,
    );
    if (straight) candidates.push(straight);
    for (const suit of SUITS) {
      const flush = pickForCounts(
        hand,
        sequence.map((rank) => ({ rank, count: 1, suit })),
        level,
      );
      if (flush) candidates.push(flush);
    }
  }
  for (const sequence of PAIR_SEQUENCES) {
    const pairs = pickForCounts(
      hand,
      sequence.map((rank) => ({ rank, count: 2 })),
      level,
    );
    if (pairs) candidates.push(pairs);
  }
  for (const sequence of TRIPLE_SEQUENCES) {
    const triples = pickForCounts(
      hand,
      sequence.map((rank) => ({ rank, count: 3 })),
      level,
    );
    if (triples) candidates.push(triples);
  }
  for (const tripleRank of STANDARD_RANKS) {
    for (const pairRank of STANDARD_RANKS) {
      if (tripleRank === pairRank) continue;
      const fullHouse = pickForCounts(
        hand,
        [
          { rank: tripleRank, count: 3 },
          { rank: pairRank, count: 2 },
        ],
        level,
      );
      if (fullHouse) candidates.push(fullHouse);
    }
  }
  const jokers = hand.filter((card) => card.rank === "SJ" || card.rank === "BJ");
  if (jokers.length === 4) candidates.push(jokers);

  const unique = new Map<string, Card[]>();
  for (const cards of candidates) {
    const key = cards.map((card) => card.id).sort().join("|");
    if (!unique.has(key)) unique.set(key, cards);
  }
  return [...unique.values()].filter((cards) => {
    const pattern = classifyHand(cards, level);
    return pattern && canBeat(pattern, target, level);
  });
}

function dealPlayers(seed: number, _level: StandardRank): PlayerState[] {
  void _level;
  const shuffled = shuffleDeck(createDeck(), seed);
  return [0, 1, 2, 3].map((id) => ({
    id,
    name: PLAYER_NAMES[id],
    team: (id % 2) as 0 | 1,
    seat: SEATS[id],
    isHuman: id === 0,
    // Keep the freshly dealt hand in its natural shuffled order. The human
    // player can arrange it later with the explicit "智能理牌" action.
    hand: shuffled.slice(id * 27, id * 27 + 27),
    finished: false,
    online: true,
    autoPlay: false,
  }));
}

export function createMatch(seed = Date.now(), difficulty: Difficulty = "standard"): MatchState {
  const currentLevel: StandardRank = "2";
  return {
    schemaVersion: 1,
    seed,
    difficulty,
    roundNumber: 1,
    currentLevel,
    teamLevels: ["2", "2"],
    players: dealPlayers(seed, currentLevel),
    round: {
      phase: "playing",
      currentPlayer: 0,
      leaderPlayer: 0,
      lastPlay: null,
      passCount: 0,
      finishOrder: [],
      history: [],
      turn: 1,
      statusMessage: "请领出一手牌",
      tribute: null,
    },
    previousFinishOrder: [],
    lastWinnerTeam: null,
    matchWinner: null,
    animationEnabled: true,
    soundEnabled: true,
  };
}

function cloneMatch(state: MatchState): MatchState {
  return structuredClone(state);
}

function activePlayers(state: MatchState) {
  return state.players.filter((player) => !player.finished);
}

function nextActivePlayer(state: MatchState, from: number): number {
  for (let offset = 1; offset <= 4; offset += 1) {
    const id = (from + offset) % 4;
    if (!state.players[id].finished) return id;
  }
  return from;
}

function advanceLevel(level: StandardRank, amount: number): StandardRank {
  const index = STANDARD_RANKS.indexOf(level);
  return STANDARD_RANKS[Math.min(STANDARD_RANKS.length - 1, index + amount)];
}

function finishRound(state: MatchState) {
  if (state.round.finishOrder.length < 3) return;
  const last = state.players.find((player) => !state.round.finishOrder.includes(player.id));
  if (last) {
    state.round.finishOrder.push(last.id);
    last.finished = true;
  }
  const order = state.round.finishOrder;
  const winnerTeam = state.players[order[0]].team;
  const partnerPosition = order.findIndex(
    (playerId) => state.players[playerId].team === winnerTeam && playerId !== order[0],
  );
  const amount = partnerPosition === 1 ? 3 : partnerPosition === 2 ? 2 : 1;
  const wasAtA = state.teamLevels[winnerTeam] === "A";
  const passedA = wasAtA && partnerPosition < 3;
  state.previousFinishOrder = [...order];
  state.lastWinnerTeam = winnerTeam;
  if (passedA) {
    state.matchWinner = winnerTeam;
    state.round.phase = "matchEnd";
    state.round.statusMessage = `${winnerTeam === 0 ? "我方" : "对方"}成功过A`;
  } else {
    state.teamLevels[winnerTeam] = advanceLevel(state.teamLevels[winnerTeam], amount);
    state.currentLevel = state.teamLevels[winnerTeam];
    state.round.phase = "roundEnd";
    state.round.statusMessage = `${winnerTeam === 0 ? "我方" : "对方"}升级 ${amount} 级`;
  }
}

export function playCards(
  state: MatchState,
  playerId: number,
  cardIds: string[],
): RuleResult {
  if (state.round.phase !== "playing") return { ok: false, state, error: "当前阶段不能出牌" };
  if (state.round.currentPlayer !== playerId) return { ok: false, state, error: "还没有轮到这位玩家" };
  const player = state.players[playerId];
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id)).filter(Boolean) as Card[];
  if (cards.length !== cardIds.length || cards.length === 0) {
    return { ok: false, state, error: "请选择有效的手牌" };
  }
  const pattern = classifyHand(cards, state.currentLevel);
  if (!pattern) return { ok: false, state, error: "这些牌不能组成合法牌型" };
  if (!canBeat(pattern, state.round.lastPlay?.pattern ?? null, state.currentLevel)) {
    return { ok: false, state, error: "所选牌型无法压过上一手" };
  }

  const next = cloneMatch(state);
  const nextPlayer = next.players[playerId];
  const selected = new Set(cardIds);
  nextPlayer.hand = nextPlayer.hand.filter((card) => !selected.has(card.id));
  const played: PlayedHand = {
    playerId,
    pattern: { ...pattern, cards },
    cards,
    turn: next.round.turn,
  };
  next.round.lastPlay = played;
  next.round.history.push(played);
  next.round.leaderPlayer = playerId;
  next.round.passCount = 0;
  next.round.turn += 1;
  next.round.statusMessage = `${nextPlayer.name}打出${pattern.label}`;
  if (nextPlayer.hand.length === 0) {
    nextPlayer.finished = true;
    next.round.finishOrder.push(playerId);
    next.round.statusMessage = `${nextPlayer.name}已出完，排名第${next.round.finishOrder.length}`;
    if (next.round.finishOrder.length >= 3) {
      finishRound(next);
      return { ok: true, state: next };
    }
  }
  next.round.currentPlayer = nextActivePlayer(next, playerId);
  return { ok: true, state: next };
}

export function passTurn(state: MatchState, playerId: number): RuleResult {
  if (state.round.phase !== "playing") return { ok: false, state, error: "当前阶段不能不要" };
  if (state.round.currentPlayer !== playerId) return { ok: false, state, error: "还没有轮到这位玩家" };
  if (!state.round.lastPlay) return { ok: false, state, error: "领出时不能选择不要" };
  const next = cloneMatch(state);
  next.round.passCount += 1;
  next.round.statusMessage = `${next.players[playerId].name}选择不要`;
  const requiredPasses = Math.max(1, activePlayers(next).length - 1);
  if (next.round.passCount >= requiredPasses) {
    const lastPlayerId = next.round.lastPlay?.playerId ?? playerId;
    const lastPlayer = next.players[lastPlayerId];
    const leadPlayer = lastPlayer.finished
      ? next.players.find((player) => !player.finished && player.team === lastPlayer.team)?.id ?? nextActivePlayer(next, playerId)
      : lastPlayerId;
    next.round.currentPlayer = leadPlayer;
    next.round.leaderPlayer = leadPlayer;
    next.round.lastPlay = null;
    next.round.passCount = 0;
    next.round.statusMessage = lastPlayer.finished ? "队友借风领出" : "新一轮领出";
  } else {
    next.round.currentPlayer = nextActivePlayer(next, playerId);
  }
  next.round.turn += 1;
  return { ok: true, state: next };
}

function highestTributeCard(hand: Card[], level: StandardRank): Card {
  const eligible = hand.filter((card) => !isWild(card, level));
  return [...eligible].sort(
    (left, right) => rankStrength(right.rank, level) - rankStrength(left.rank, level),
  )[0];
}

function returnCard(hand: Card[]): Card {
  const normalValue = (rank: Rank) => {
    if (rank === "SJ" || rank === "BJ") return 99;
    return STANDARD_RANKS.indexOf(rank) + 2;
  };
  const eligible = hand.filter((card) => normalValue(card.rank) <= 10);
  const pool = eligible.length ? eligible : hand;
  return [...pool].sort((left, right) => normalValue(left.rank) - normalValue(right.rank))[0];
}

function prepareTribute(state: MatchState): TributeState | null {
  const order = state.previousFinishOrder;
  if (order.length !== 4) return null;
  const doubleDown = state.players[order[0]].team === state.players[order[1]].team;
  const donors = doubleDown ? [order[2], order[3]] : [order[3]];
  const receivers = doubleDown ? [order[0], order[1]] : [order[0]];
  const bigJokers = donors.reduce(
    (count, id) => count + state.players[id].hand.filter((card) => card.rank === "BJ").length,
    0,
  );
  return {
    donors,
    receivers,
    anti: bigJokers >= 2,
    summary: bigJokers >= 2 ? "抓到两张大王，抗贡成功" : doubleDown ? "双下：双方各进贡一张" : "末游向头游进贡",
  };
}

export function resolveTribute(state: MatchState): RuleResult {
  if (state.round.phase !== "tribute" || !state.round.tribute) {
    return { ok: false, state, error: "当前没有待处理的贡还牌" };
  }
  const next = cloneMatch(state);
  const tribute = next.round.tribute!;
  if (!tribute.anti) {
    const donations = tribute.donors.map((donorId) => ({
      donorId,
      card: highestTributeCard(next.players[donorId].hand, next.currentLevel),
    }));
    donations.sort(
      (left, right) =>
        rankStrength(right.card.rank, next.currentLevel) - rankStrength(left.card.rank, next.currentLevel),
    );
    donations.forEach((donation, index) => {
      const receiverId = tribute.receivers[index];
      next.players[donation.donorId].hand = next.players[donation.donorId].hand.filter(
        (card) => card.id !== donation.card.id,
      );
      next.players[receiverId].hand.push(donation.card);
      const returned = returnCard(next.players[receiverId].hand);
      next.players[receiverId].hand = next.players[receiverId].hand.filter(
        (card) => card.id !== returned.id,
      );
      next.players[donation.donorId].hand.push(returned);
    });
    next.players.forEach((player) => {
      player.hand = sortHand(player.hand, next.currentLevel);
    });
  }
  next.round.phase = "playing";
  next.round.currentPlayer = tribute.anti ? next.previousFinishOrder[0] : tribute.donors[0];
  next.round.leaderPlayer = next.round.currentPlayer;
  next.round.statusMessage = tribute.anti ? "抗贡成功，头游领出" : "贡还牌完成，进贡者领出";
  next.round.tribute = null;
  return { ok: true, state: next };
}

export function startNextRound(state: MatchState, seed = state.seed + state.roundNumber * 997): RuleResult {
  if (state.round.phase !== "roundEnd") return { ok: false, state, error: "本副牌尚未结束" };
  const next = cloneMatch(state);
  next.seed = seed;
  next.roundNumber += 1;
  next.players = dealPlayers(seed, next.currentLevel);
  const tribute = prepareTribute(next);
  next.round = {
    phase: tribute ? "tribute" : "playing",
    currentPlayer: next.previousFinishOrder[0] ?? 0,
    leaderPlayer: next.previousFinishOrder[0] ?? 0,
    lastPlay: null,
    passCount: 0,
    finishOrder: [],
    history: [],
    turn: 1,
    statusMessage: tribute?.summary ?? "新一副牌开始",
    tribute,
  };
  return { ok: true, state: next };
}

export function observeForAi(state: MatchState, playerId: number): AiObservation {
  const player = state.players[playerId];
  const teammate = state.players.find((candidate) => candidate.id !== playerId && candidate.team === player.team)!;
  return {
    playerId,
    team: player.team,
    ownHand: player.hand.map((card) => ({ ...card })),
    currentLevel: state.currentLevel,
    lastPlay: state.round.lastPlay ? structuredClone(state.round.lastPlay) : null,
    teammateRemaining: teammate.hand.length,
    opponentRemaining: state.players
      .filter((candidate) => candidate.team !== player.team)
      .map((candidate) => candidate.hand.length),
    publicHistory: structuredClone(state.round.history),
    difficulty: state.difficulty,
    seed: state.seed + state.round.turn * 31 + playerId,
  };
}

function aiMoveScore(cards: Card[], observation: AiObservation): number {
  const pattern = classifyHand(cards, observation.currentLevel)!;
  const bombPenalty = bombTier(pattern) > 0 ? 80 : 0;
  const strength = rankStrength(pattern.mainRank, observation.currentLevel);
  const finishBonus = cards.length === observation.ownHand.length ? -500 : 0;
  const combinationBonus = -cards.length * 8;
  return strength + bombPenalty + combinationBonus + finishBonus;
}

export function chooseAiMove(observation: AiObservation): Card[] | null {
  const legal = getLegalMoves(
    observation.ownHand,
    observation.lastPlay?.pattern ?? null,
    observation.currentLevel,
  );
  if (!legal.length) return null;
  if (observation.difficulty === "casual") {
    const random = randomFactory(observation.seed);
    return legal[Math.floor(random() * legal.length)];
  }
  const sorted = [...legal].sort(
    (left, right) => aiMoveScore(left, observation) - aiMoveScore(right, observation),
  );
  if (observation.difficulty === "expert") {
    const winning = sorted.find((cards) => cards.length === observation.ownHand.length);
    if (winning) return winning;
    if (observation.teammateRemaining <= 2 && observation.lastPlay?.playerId !== undefined) {
      const lastPlayerId = observation.publicHistory.at(-1)?.playerId;
      const lastTeam = lastPlayerId === undefined ? -1 : lastPlayerId % 2;
      if (lastTeam === observation.team && observation.lastPlay) return null;
    }
    return sorted.sort((left, right) => {
      const leftPattern = classifyHand(left, observation.currentLevel)!;
      const rightPattern = classifyHand(right, observation.currentLevel)!;
      return leftPattern.cards.length === rightPattern.cards.length
        ? aiMoveScore(left, observation) - aiMoveScore(right, observation)
        : rightPattern.cards.length - leftPattern.cards.length;
    })[0];
  }
  return sorted[0];
}

export function applyAction(state: MatchState, action: GameAction): RuleResult {
  switch (action.type) {
    case "PLAY":
      return playCards(state, action.playerId, action.cardIds);
    case "PASS":
      return passTurn(state, action.playerId);
    case "RESOLVE_TRIBUTE":
      return resolveTribute(state);
    case "NEXT_ROUND":
      return startNextRound(state, action.seed);
  }
}

export function serializeGame(match: MatchState): string {
  const saved: SavedGame = {
    schemaVersion: 1,
    savedAt: new Date().toISOString(),
    match,
  };
  return JSON.stringify(saved);
}

export function restoreGame(value: string): MatchState | null {
  try {
    const saved = JSON.parse(value) as SavedGame;
    if (saved.schemaVersion !== 1 || saved.match?.schemaVersion !== 1) return null;
    if (!Array.isArray(saved.match.players) || saved.match.players.length !== 4) return null;
    const handCards = saved.match.players.flatMap((player) => player.hand);
    if (new Set(handCards.map((card) => card.id)).size !== handCards.length) return null;
    if (handCards.some((card) => !card.id || !card.rank)) return null;
    return saved.match;
  } catch {
    return null;
  }
}
