/**
 * Captain & Crew Scoring Engine
 *
 * Reusable scoring engine for the Chunks product.
 * Supports both Faceoff mode (same-device) and Room mode (multi-device).
 *
 * Language contract:
 * - Captain turn = Vietnamese speech
 * - Crew turn = English speech
 */

export * from './types.js';
export * from './errors.js';
export * from './config.js';
export { validateTranscriptInput, PassThroughTranscriptProvider, captureTranscripts } from './c1-transcript.js';
export { validateMeaningInput, DeterministicMeaningEvaluator, evaluateMeaning } from './c2-meaning.js';
export {
  validateDifficultyInput,
  DeterministicDifficultyEvaluator,
  evaluateDifficulty,
} from './c3-difficulty.js';
export { validateTimingInput, calculateTimingCoefficient, evaluateTiming } from './c4-timing.js';
export { aggregateRoundScore } from './c5-aggregation.js';
export {
  determineRoles,
  buildRoundRecord,
  updatePlayerScores,
  createMatch,
  addRoundToMatch,
  InMemoryRoundStore,
  InMemoryMatchStore,
} from './c6-persistence.js';

import type {
  RoundInput,
  RoundResult,
  ScoringConfig,
  TranscriptProvider,
  MeaningEvaluator,
  DifficultyEvaluator,
  RoundStore,
  MatchStore,
  MatchState,
  PlayerIdentity,
  PlayerRole,
} from './types.js';
import { ScoringEngineError } from './errors.js';
import { createDefaultConfig, mergeConfig, validateConfig } from './config.js';
import { PassThroughTranscriptProvider } from './c1-transcript.js';
import { DeterministicMeaningEvaluator, evaluateMeaning } from './c2-meaning.js';
import { DeterministicDifficultyEvaluator, evaluateDifficulty } from './c3-difficulty.js';
import { evaluateTiming } from './c4-timing.js';
import { aggregateRoundScore } from './c5-aggregation.js';
import {
  buildRoundRecord,
  addRoundToMatch,
  InMemoryRoundStore,
  InMemoryMatchStore,
  createMatch,
} from './c6-persistence.js';

export interface ScoringEngineOptions {
  config?: Partial<ScoringConfig>;
  transcriptProvider?: TranscriptProvider;
  meaningEvaluator?: MeaningEvaluator;
  difficultyEvaluator?: DifficultyEvaluator;
  roundStore?: RoundStore;
  matchStore?: MatchStore;
}

/**
 * The main scoring engine orchestrator.
 * Wires together all capabilities (C1–C6) and provides the top-level API.
 */
export class ScoringEngine {
  private readonly config: ScoringConfig;
  private readonly transcriptProvider: TranscriptProvider;
  private readonly meaningEvaluator: MeaningEvaluator;
  private readonly difficultyEvaluator: DifficultyEvaluator;
  private readonly roundStore: RoundStore;
  private readonly matchStore: MatchStore;

  constructor(options: ScoringEngineOptions = {}) {
    const baseConfig = createDefaultConfig();
    this.config = mergeConfig(baseConfig, options.config);
    validateConfig(this.config);

    this.transcriptProvider = options.transcriptProvider ?? new PassThroughTranscriptProvider();
    this.meaningEvaluator = options.meaningEvaluator ?? new DeterministicMeaningEvaluator();
    this.difficultyEvaluator = options.difficultyEvaluator ?? new DeterministicDifficultyEvaluator();
    this.roundStore = options.roundStore ?? new InMemoryRoundStore();
    this.matchStore = options.matchStore ?? new InMemoryMatchStore();
  }

  getConfig(): ScoringConfig {
    return {
      ...this.config,
      weights: { ...this.config.weights },
      timing: { ...this.config.timing },
      difficulty: {
        weights: { ...this.config.difficulty.weights },
        lengthBuckets: this.config.difficulty.lengthBuckets.map(b => ({ ...b })),
      },
    };
  }

  /**
   * Creates a new match and persists the initial state.
   */
  async createMatch(
    mode: 'faceoff' | 'room',
    players: PlayerIdentity[]
  ): Promise<MatchState> {
    const match = createMatch({
      mode,
      players,
      roleSwapPolicy: this.config.roleSwapPolicy,
      configVersion: this.config.version,
    });

    await this.matchStore.saveMatch(match);
    return match;
  }

  /**
   * Scores a complete round: evaluates meaning, difficulty, timing,
   * aggregates, persists, and returns the result.
   */
  async scoreRound(input: RoundInput): Promise<RoundResult> {
    const partialDiagnostics: Record<string, unknown> = {};

    try {
      // Resolve match state
      let match = await this.matchStore.getMatch(input.matchId);
      if (!match) {
        return {
          success: false,
          error: {
            category: 'invalid_input',
            message: `Match ${input.matchId} not found`,
          },
        };
      }

      const roundNumber = match.currentRound + 1;

      // Validate player IDs
      const players = match.players;
      if (input.captainPlayerId === input.crewPlayerId) {
        return {
          success: false,
          error: {
            category: 'invalid_input',
            message: 'captainPlayerId and crewPlayerId must be different',
          },
        };
      }
      if (!players.some(p => p.playerId === input.captainPlayerId)) {
        return {
          success: false,
          error: {
            category: 'invalid_input',
            message: `Captain player ${input.captainPlayerId} is not in this match`,
          },
        };
      }
      if (!players.some(p => p.playerId === input.crewPlayerId)) {
        return {
          success: false,
          error: {
            category: 'invalid_input',
            message: `Crew player ${input.crewPlayerId} is not in this match`,
          },
        };
      }

      // Build roles for round
      const rolesForRound: Record<string, PlayerRole> = {
        [input.captainPlayerId]: 'captain',
        [input.crewPlayerId]: 'crew',
      };

      // Resolve effective config
      const effectiveConfig = input.config
        ? mergeConfig(this.config, input.config)
        : this.config;

      // C2: Meaning evaluation
      partialDiagnostics['step'] = 'meaning_evaluation';
      const meaningResult = await evaluateMeaning(
        input.captainTranscript,
        input.crewTranscript,
        effectiveConfig.strictness,
        this.meaningEvaluator
      );
      partialDiagnostics['meaningResult'] = meaningResult;

      // C3: Difficulty evaluation
      partialDiagnostics['step'] = 'difficulty_evaluation';
      const difficultyResult = await evaluateDifficulty(
        input.captainTranscript,
        this.difficultyEvaluator,
        effectiveConfig.difficulty
      );
      partialDiagnostics['difficultyResult'] = difficultyResult;

      // C4: Timing evaluation
      partialDiagnostics['step'] = 'timing_evaluation';
      const timingResult = evaluateTiming({
        captainStopTimestamp: input.captainStopTimestamp,
        crewStartTimestamp: input.crewStartTimestamp,
        config: effectiveConfig.timing,
      });
      partialDiagnostics['timingResult'] = timingResult;

      // Handle timeout at meaning level
      if (timingResult.isTimeout && meaningResult.decision !== 'timeout') {
        meaningResult.decision = 'timeout';
      }

      // C5: Aggregation
      partialDiagnostics['step'] = 'aggregation';
      const aggregationResult = aggregateRoundScore({
        meaning: meaningResult,
        difficulty: difficultyResult,
        timing: timingResult,
        weights: effectiveConfig.weights,
      });

      // C6: Build and persist round record
      partialDiagnostics['step'] = 'persistence';
      const round = buildRoundRecord({
        matchId: input.matchId,
        roundNumber,
        mode: input.mode,
        players,
        rolesForRound,
        captainTranscript: input.captainTranscript,
        crewTranscript: input.crewTranscript,
        meaning: meaningResult,
        difficulty: difficultyResult,
        timing: timingResult,
        aggregation: aggregationResult,
        configVersion: effectiveConfig.version,
      });

      // Update match state atomically
      match = addRoundToMatch(match, round);

      // Persist
      await this.roundStore.saveRound(round);
      await this.matchStore.saveMatch(match);

      return {
        success: true,
        round,
        matchState: match,
      };
    } catch (error) {
      if (error instanceof ScoringEngineError) {
        return {
          success: false,
          error: error.toScoringError(),
          partialDiagnostics,
        };
      }

      return {
        success: false,
        error: {
          category: 'persistence_failure',
          message: error instanceof Error ? error.message : String(error),
        },
        partialDiagnostics,
      };
    }
  }

  /**
   * Retrieves match state by ID.
   */
  async getMatch(matchId: string): Promise<MatchState | null> {
    return this.matchStore.getMatch(matchId);
  }

  /**
   * Retrieves all rounds for a match.
   */
  async getMatchRounds(matchId: string): Promise<import('./types.js').RoundRecord[]> {
    return this.roundStore.getRoundsByMatch(matchId);
  }
}
