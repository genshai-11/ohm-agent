import type {
  RoundRecord,
  MatchState,
  PlayerIdentity,
  PlayerScore,
  PlayerRole,
  GameMode,
  RoleSwapPolicy,
  AggregationResult,
  MeaningResult,
  DifficultyResult,
  TimingResult,
  RoundStore,
  MatchStore,
  ScoringConfig,
} from './types.js';
import { persistenceFailure, invalidInput } from './errors.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * C6: Round Persistence & Match Tracking
 *
 * Stores round data and updates per-player progression.
 * - Round writes are atomic (no partial score objects persisted)
 * - Player score tracking is by player identity, not by role
 * - Role swap between rounds does not break cumulative tracking
 */

// ─── Role Management ─────────────────────────────────────────────

/**
 * Determines roles for the next round based on role swap policy.
 */
export function determineRoles(
  players: PlayerIdentity[],
  currentRoles: Record<string, PlayerRole>,
  roundNumber: number,
  policy: RoleSwapPolicy
): Record<string, PlayerRole> {
  if (players.length !== 2) {
    throw invalidInput('Captain & Crew requires exactly 2 players');
  }

  const [p1, p2] = players;

  // First round: assign initial roles
  if (roundNumber === 1 || Object.keys(currentRoles).length === 0) {
    return {
      [p1.playerId]: 'captain',
      [p2.playerId]: 'crew',
    };
  }

  switch (policy) {
    case 'every_round':
      return swapRoles(currentRoles, players);

    case 'every_two':
      return roundNumber % 2 === 1
        ? swapRoles(currentRoles, players)
        : { ...currentRoles };

    case 'manual':
      return { ...currentRoles };

    default:
      return swapRoles(currentRoles, players);
  }
}

function swapRoles(
  currentRoles: Record<string, PlayerRole>,
  players: PlayerIdentity[]
): Record<string, PlayerRole> {
  const swapped: Record<string, PlayerRole> = {};
  for (const player of players) {
    const currentRole = currentRoles[player.playerId];
    swapped[player.playerId] = currentRole === 'captain' ? 'crew' : 'captain';
  }
  return swapped;
}

// ─── Round Record Builder ────────────────────────────────────────

export function buildRoundRecord(params: {
  matchId: string;
  roundNumber: number;
  mode: GameMode;
  players: PlayerIdentity[];
  rolesForRound: Record<string, PlayerRole>;
  captainTranscript: string;
  crewTranscript: string;
  meaning: MeaningResult;
  difficulty: DifficultyResult;
  timing: TimingResult;
  aggregation: AggregationResult;
  configVersion: string;
  providerMetadata?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
}): RoundRecord {
  return {
    roundId: uuidv4(),
    matchId: params.matchId,
    roundNumber: params.roundNumber,
    mode: params.mode,
    players: params.players,
    rolesForRound: params.rolesForRound,
    captainTranscript: params.captainTranscript,
    crewTranscript: params.crewTranscript,
    meaningScore: params.meaning.meaningScore,
    decision: params.meaning.decision,
    missingConcepts: params.meaning.missingConcepts,
    extraConcepts: params.meaning.extraConcepts,
    difficultyScore: params.difficulty.difficultyScore,
    chunks: params.difficulty.chunks,
    responseDelayMs: params.timing.responseDelayMs,
    timingCoefficient: params.timing.timingCoefficient,
    roundScore: params.aggregation.roundScore,
    components: params.aggregation.components,
    verdict: params.aggregation.verdict,
    trace: params.aggregation.trace,
    configVersion: params.configVersion,
    providerMetadata: params.providerMetadata,
    diagnostics: params.diagnostics,
    createdAt: new Date().toISOString(),
  };
}

// ─── Player Score Tracking ───────────────────────────────────────

function initPlayerScore(player: PlayerIdentity): PlayerScore {
  return {
    playerId: player.playerId,
    displayName: player.displayName,
    totalScore: 0,
    roundsPlayed: 0,
    roundsAsCaptain: 0,
    roundsAsCrew: 0,
    averageScore: 0,
    roundHistory: [],
  };
}

/**
 * Updates player scores with a new round result.
 * AC6.1: Round writes must be atomic.
 * AC6.2: Player score tracking must be by player identity, not by role.
 * AC6.3: Role swap between rounds must not break cumulative tracking.
 */
export function updatePlayerScores(
  scores: Record<string, PlayerScore>,
  players: PlayerIdentity[],
  round: RoundRecord
): Record<string, PlayerScore> {
  const updated = { ...scores };

  for (const player of players) {
    if (!updated[player.playerId]) {
      updated[player.playerId] = initPlayerScore(player);
    }

    const playerScore = { ...updated[player.playerId] };
    const role = round.rolesForRound[player.playerId];

    playerScore.totalScore += round.roundScore;
    playerScore.roundsPlayed += 1;
    if (role === 'captain') playerScore.roundsAsCaptain += 1;
    if (role === 'crew') playerScore.roundsAsCrew += 1;
    playerScore.averageScore = Math.round(playerScore.totalScore / playerScore.roundsPlayed);
    playerScore.roundHistory = [
      ...playerScore.roundHistory,
      {
        roundId: round.roundId,
        roundNumber: round.roundNumber,
        role,
        score: round.roundScore,
      },
    ];

    updated[player.playerId] = playerScore;
  }

  return updated;
}

// ─── Match State Management ──────────────────────────────────────

export function createMatch(params: {
  mode: GameMode;
  players: PlayerIdentity[];
  roleSwapPolicy: RoleSwapPolicy;
  configVersion: string;
}): MatchState {
  if (params.players.length !== 2) {
    throw invalidInput('Captain & Crew requires exactly 2 players');
  }

  const matchId = uuidv4();
  const initialRoles = determineRoles(params.players, {}, 1, params.roleSwapPolicy);

  const playerScores: Record<string, PlayerScore> = {};
  for (const player of params.players) {
    playerScores[player.playerId] = initPlayerScore(player);
  }

  return {
    matchId,
    mode: params.mode,
    players: params.players,
    currentRound: 0,
    roleSwapPolicy: params.roleSwapPolicy,
    currentRoles: initialRoles,
    playerScores,
    rounds: [],
    configVersion: params.configVersion,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Adds a round to the match state and updates all tracking.
 * This is the atomic write operation - all or nothing.
 */
export function addRoundToMatch(
  match: MatchState,
  round: RoundRecord
): MatchState {
  const nextRoundNumber = match.currentRound + 1;

  if (round.roundNumber !== nextRoundNumber) {
    throw invalidInput(
      `Expected round ${nextRoundNumber}, got ${round.roundNumber}`
    );
  }

  const updatedScores = updatePlayerScores(
    match.playerScores,
    match.players,
    round
  );

  // Determine roles for the next round
  const nextRoles = determineRoles(
    match.players,
    round.rolesForRound,
    nextRoundNumber + 1,
    match.roleSwapPolicy
  );

  return {
    ...match,
    currentRound: nextRoundNumber,
    currentRoles: nextRoles,
    playerScores: updatedScores,
    rounds: [...match.rounds, round],
    updatedAt: new Date().toISOString(),
  };
}

// ─── In-Memory Store (default) ───────────────────────────────────

export class InMemoryRoundStore implements RoundStore {
  private rounds = new Map<string, RoundRecord>();
  private matchRounds = new Map<string, string[]>();

  async saveRound(record: RoundRecord): Promise<void> {
    this.rounds.set(record.roundId, record);

    const matchRoundIds = this.matchRounds.get(record.matchId) ?? [];
    matchRoundIds.push(record.roundId);
    this.matchRounds.set(record.matchId, matchRoundIds);
  }

  async getRound(roundId: string): Promise<RoundRecord | null> {
    return this.rounds.get(roundId) ?? null;
  }

  async getRoundsByMatch(matchId: string): Promise<RoundRecord[]> {
    const roundIds = this.matchRounds.get(matchId) ?? [];
    return roundIds
      .map(id => this.rounds.get(id))
      .filter((r): r is RoundRecord => r !== undefined);
  }
}

export class InMemoryMatchStore implements MatchStore {
  private matches = new Map<string, MatchState>();

  async saveMatch(state: MatchState): Promise<void> {
    this.matches.set(state.matchId, state);
  }

  async getMatch(matchId: string): Promise<MatchState | null> {
    return this.matches.get(matchId) ?? null;
  }
}
