import type {
  ScoringConfig,
  WeightProfile,
  TimingConfig,
  DifficultyConfig,
  LengthBucketConfig,
  OhmLabel,
  StrictnessProfile,
  RoleSwapPolicy,
} from './types.js';
import { configValidationError } from './errors.js';

export const DEFAULT_OHM_WEIGHTS: Record<OhmLabel, number> = {
  RED: 9,
  BLUE: 7,
  GREEN: 5,
  PINK: 3,
};

export const DEFAULT_LENGTH_BUCKETS: LengthBucketConfig[] = [
  { name: 'veryShort', maxSentences: 1, maxWords: 25, coefficient: 1.0 },
  { name: 'short', maxSentences: 2, maxWords: 35, coefficient: 1.5 },
  { name: 'medium', maxSentences: 3, maxWords: 60, coefficient: 2.0 },
  { name: 'long', maxSentences: 5, maxWords: 110, coefficient: 2.5 },
  { name: 'overLong', maxSentences: Infinity, maxWords: Infinity, coefficient: 2.5 },
];

export const DEFAULT_WEIGHT_PROFILE: WeightProfile = {
  meaningWeight: 0.6,
  difficultyWeight: 0.25,
  timingWeight: 0.15,
};

export const DEFAULT_TIMING_CONFIG: TimingConfig = {
  fastThresholdMs: 2000,
  slowThresholdMs: 5000,
  minCoefficient: 0.33,
  maxCoefficient: 1.0,
  timeoutMs: 30000,
};

export const DEFAULT_DIFFICULTY_CONFIG: DifficultyConfig = {
  weights: DEFAULT_OHM_WEIGHTS,
  lengthBuckets: DEFAULT_LENGTH_BUCKETS,
};

export function createDefaultConfig(): ScoringConfig {
  return {
    version: '1.0.0',
    strictness: 'medium',
    weights: { ...DEFAULT_WEIGHT_PROFILE },
    timing: { ...DEFAULT_TIMING_CONFIG },
    difficulty: {
      weights: { ...DEFAULT_OHM_WEIGHTS },
      lengthBuckets: DEFAULT_LENGTH_BUCKETS.map(b => ({ ...b })),
    },
    roleSwapPolicy: 'every_round',
  };
}

export function mergeConfig(base: ScoringConfig, overrides?: Partial<ScoringConfig>): ScoringConfig {
  if (!overrides) return base;

  const merged: ScoringConfig = {
    version: overrides.version ?? base.version,
    strictness: overrides.strictness ?? base.strictness,
    roleSwapPolicy: overrides.roleSwapPolicy ?? base.roleSwapPolicy,
    providerMetadata: overrides.providerMetadata ?? base.providerMetadata,
    weights: overrides.weights
      ? { ...base.weights, ...overrides.weights }
      : { ...base.weights },
    timing: overrides.timing
      ? { ...base.timing, ...overrides.timing }
      : { ...base.timing },
    difficulty: overrides.difficulty
      ? {
          weights: overrides.difficulty.weights
            ? { ...base.difficulty.weights, ...overrides.difficulty.weights }
            : { ...base.difficulty.weights },
          lengthBuckets: overrides.difficulty.lengthBuckets ?? [...base.difficulty.lengthBuckets],
        }
      : {
          weights: { ...base.difficulty.weights },
          lengthBuckets: [...base.difficulty.lengthBuckets],
        },
  };

  return merged;
}

export function validateConfig(config: ScoringConfig): void {
  const errors: string[] = [];

  if (!config.version || typeof config.version !== 'string') {
    errors.push('version must be a non-empty string');
  }

  const validStrictness: StrictnessProfile[] = ['loose', 'medium', 'strict'];
  if (!validStrictness.includes(config.strictness)) {
    errors.push(`strictness must be one of: ${validStrictness.join(', ')}`);
  }

  const validPolicies: RoleSwapPolicy[] = ['every_round', 'every_two', 'manual'];
  if (!validPolicies.includes(config.roleSwapPolicy)) {
    errors.push(`roleSwapPolicy must be one of: ${validPolicies.join(', ')}`);
  }

  const { weights } = config;
  if (weights.meaningWeight < 0 || weights.meaningWeight > 1) {
    errors.push('meaningWeight must be between 0 and 1');
  }
  if (weights.difficultyWeight < 0 || weights.difficultyWeight > 1) {
    errors.push('difficultyWeight must be between 0 and 1');
  }
  if (weights.timingWeight < 0 || weights.timingWeight > 1) {
    errors.push('timingWeight must be between 0 and 1');
  }
  const totalWeight = weights.meaningWeight + weights.difficultyWeight + weights.timingWeight;
  if (Math.abs(totalWeight - 1.0) > 0.001) {
    errors.push(`weight profile must sum to 1.0 (got ${totalWeight})`);
  }

  const { timing } = config;
  if (timing.fastThresholdMs < 0) errors.push('fastThresholdMs must be non-negative');
  if (timing.slowThresholdMs <= timing.fastThresholdMs) {
    errors.push('slowThresholdMs must be greater than fastThresholdMs');
  }
  if (timing.minCoefficient < 0 || timing.minCoefficient > 1) {
    errors.push('minCoefficient must be between 0 and 1');
  }
  if (timing.maxCoefficient < timing.minCoefficient || timing.maxCoefficient > 1) {
    errors.push('maxCoefficient must be >= minCoefficient and <= 1');
  }
  if (timing.timeoutMs <= 0) errors.push('timeoutMs must be positive');

  const ohmLabels: OhmLabel[] = ['GREEN', 'BLUE', 'RED', 'PINK'];
  for (const label of ohmLabels) {
    if (typeof config.difficulty.weights[label] !== 'number' || config.difficulty.weights[label] < 0) {
      errors.push(`difficulty weight for ${label} must be a non-negative number`);
    }
  }

  if (config.difficulty.lengthBuckets.length === 0) {
    errors.push('at least one length bucket must be defined');
  }

  if (errors.length > 0) {
    throw configValidationError(
      `Invalid scoring config: ${errors.join('; ')}`,
      { errors }
    );
  }
}
