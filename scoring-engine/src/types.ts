// ─── OHM Labels ───────────────────────────────────────────────────
export type OhmLabel = 'GREEN' | 'BLUE' | 'RED' | 'PINK';

export type GameMode = 'faceoff' | 'room';
export type PlayerRole = 'captain' | 'crew';
export type TranscriptLanguage = 'vi' | 'en';
export type StrictnessProfile = 'loose' | 'medium' | 'strict';
export type MeaningDecision = 'match' | 'partial' | 'mismatch' | 'timeout';
export type RoleSwapPolicy = 'every_round' | 'every_two' | 'manual';

export type LengthBucket = 'veryShort' | 'short' | 'medium' | 'long' | 'overLong';

// ─── Error Categories ─────────────────────────────────────────────
export type ScoringErrorCategory =
  | 'transcript_unavailable'
  | 'meaning_evaluator_unavailable'
  | 'difficulty_evaluator_unavailable'
  | 'timeout'
  | 'persistence_failure'
  | 'invalid_input'
  | 'config_validation_error';

// ─── C1: Transcript Capture ──────────────────────────────────────
export interface TranscriptInput {
  audioPayload: ArrayBuffer | string;
  role: PlayerRole;
  language: TranscriptLanguage;
}

export interface TranscriptResult {
  text: string;
  confidence: number;
  role: PlayerRole;
  language: TranscriptLanguage;
  providerMetadata?: Record<string, unknown>;
}

// ─── C2: Meaning Match Evaluation ────────────────────────────────
export interface MeaningInput {
  captainTranscript: string;
  crewTranscript: string;
  strictness: StrictnessProfile;
}

export interface MeaningResult {
  meaningScore: number;
  decision: MeaningDecision;
  reason: string;
  missingConcepts: string[];
  extraConcepts: string[];
}

// ─── C3: Semantic Difficulty (OHM) ───────────────────────────────
export interface OhmChunk {
  text: string;
  label: OhmLabel;
  confidence: number;
  reason: string;
}

export interface DifficultyInput {
  captainTranscript: string;
  config?: Partial<DifficultyConfig>;
}

export interface DifficultyConfig {
  weights: Record<OhmLabel, number>;
  lengthBuckets: LengthBucketConfig[];
}

export interface LengthBucketConfig {
  name: LengthBucket;
  maxSentences: number;
  maxWords: number;
  coefficient: number;
}

export interface DifficultyResult {
  difficultyScore: number;
  chunks: OhmChunk[];
  baseOhm: number;
  lengthBucket: LengthBucket;
  lengthCoefficient: number;
  sentenceCount: number;
  wordCount: number;
  formula: string;
}

// ─── C4: Response Timing ─────────────────────────────────────────
export interface TimingInput {
  captainStopTimestamp: number;
  crewStartTimestamp: number;
  config?: Partial<TimingConfig>;
}

export interface TimingConfig {
  fastThresholdMs: number;
  slowThresholdMs: number;
  minCoefficient: number;
  maxCoefficient: number;
  timeoutMs: number;
}

export interface TimingResult {
  responseDelayMs: number;
  timingCoefficient: number;
  isTimeout: boolean;
}

// ─── C5: Round Score Aggregation ─────────────────────────────────
export interface AggregationInput {
  meaning: MeaningResult;
  difficulty: DifficultyResult;
  timing: TimingResult;
  weights?: WeightProfile;
}

export interface WeightProfile {
  meaningWeight: number;
  difficultyWeight: number;
  timingWeight: number;
}

export interface AggregationResult {
  roundScore: number;
  components: {
    meaningContribution: number;
    difficultyContribution: number;
    timingContribution: number;
  };
  verdict: string;
  trace: AggregationTrace;
}

export interface AggregationTrace {
  baseOhm: number;
  lengthCoefficient: number;
  timingCoefficient: number;
  difficultyScore: number;
  meaningScore: number;
  formula: string;
}

// ─── C6: Round Persistence & Match Tracking ──────────────────────
export interface PlayerIdentity {
  playerId: string;
  displayName?: string;
}

export interface RoundRecord {
  roundId: string;
  matchId: string;
  roundNumber: number;
  mode: GameMode;
  players: PlayerIdentity[];
  rolesForRound: Record<string, PlayerRole>;
  captainTranscript: string;
  crewTranscript: string;
  meaningScore: number;
  decision: MeaningDecision;
  missingConcepts: string[];
  extraConcepts: string[];
  difficultyScore: number;
  chunks: OhmChunk[];
  responseDelayMs: number;
  timingCoefficient: number;
  roundScore: number;
  components: AggregationResult['components'];
  verdict: string;
  trace: AggregationTrace;
  configVersion: string;
  providerMetadata?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
  createdAt: string;
}

export interface PlayerScore {
  playerId: string;
  displayName?: string;
  totalScore: number;
  roundsPlayed: number;
  roundsAsCaptain: number;
  roundsAsCrew: number;
  averageScore: number;
  roundHistory: Array<{
    roundId: string;
    roundNumber: number;
    role: PlayerRole;
    score: number;
  }>;
}

export interface MatchState {
  matchId: string;
  mode: GameMode;
  players: PlayerIdentity[];
  currentRound: number;
  roleSwapPolicy: RoleSwapPolicy;
  currentRoles: Record<string, PlayerRole>;
  playerScores: Record<string, PlayerScore>;
  rounds: RoundRecord[];
  configVersion: string;
  status: 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// ─── Global Configuration ────────────────────────────────────────
export interface ScoringConfig {
  version: string;
  strictness: StrictnessProfile;
  weights: WeightProfile;
  timing: TimingConfig;
  difficulty: DifficultyConfig;
  roleSwapPolicy: RoleSwapPolicy;
  providerMetadata?: Record<string, unknown>;
}

// ─── Scoring Error ───────────────────────────────────────────────
export interface ScoringError {
  category: ScoringErrorCategory;
  message: string;
  diagnostics?: Record<string, unknown>;
}

// ─── Engine API ──────────────────────────────────────────────────
export interface RoundInput {
  matchId: string;
  mode: GameMode;
  captainPlayerId: string;
  crewPlayerId: string;
  captainTranscript: string;
  crewTranscript: string;
  captainStopTimestamp: number;
  crewStartTimestamp: number;
  config?: Partial<ScoringConfig>;
}

export interface RoundOutput {
  success: true;
  round: RoundRecord;
  matchState: MatchState;
}

export interface RoundError {
  success: false;
  error: ScoringError;
  partialDiagnostics?: Record<string, unknown>;
}

export type RoundResult = RoundOutput | RoundError;

// ─── Provider interfaces (for dependency injection) ──────────────
export interface TranscriptProvider {
  transcribe(input: TranscriptInput): Promise<TranscriptResult>;
}

export interface MeaningEvaluator {
  evaluate(input: MeaningInput): Promise<MeaningResult>;
}

export interface DifficultyEvaluator {
  evaluate(input: DifficultyInput): Promise<DifficultyResult>;
}

export interface RoundStore {
  saveRound(record: RoundRecord): Promise<void>;
  getRound(roundId: string): Promise<RoundRecord | null>;
  getRoundsByMatch(matchId: string): Promise<RoundRecord[]>;
}

export interface MatchStore {
  saveMatch(state: MatchState): Promise<void>;
  getMatch(matchId: string): Promise<MatchState | null>;
}
