import type {
  AggregationInput,
  AggregationResult,
  AggregationTrace,
  WeightProfile,
  MeaningResult,
  DifficultyResult,
  TimingResult,
} from './types.js';
import { DEFAULT_WEIGHT_PROFILE } from './config.js';
import { invalidInput } from './errors.js';

/**
 * C5: Round Score Aggregation
 *
 * Combines component signals into final score and verdict.
 *
 * Score Semantics Rules:
 * 1. Meaning-first: High meaning mismatch cannot be rescued by fast timing alone.
 * 2. Cross-language: Meaning evaluated from Vietnamese source intent to English response.
 * 3. Difficulty adjustment: Harder source allows higher reward if meaning preserved.
 * 4. Timing influence: Timing modifies final score but does not define semantic correctness.
 * 5. Explainability: Every score must be explainable by component values and formula trace.
 */

function validateAggregationInput(input: AggregationInput): void {
  if (!input.meaning) throw invalidInput('meaning result is required');
  if (!input.difficulty) throw invalidInput('difficulty result is required');
  if (!input.timing) throw invalidInput('timing result is required');

  if (typeof input.meaning.meaningScore !== 'number') {
    throw invalidInput('meaningScore must be a number');
  }
  if (typeof input.difficulty.difficultyScore !== 'number') {
    throw invalidInput('difficultyScore must be a number');
  }
  if (typeof input.timing.timingCoefficient !== 'number') {
    throw invalidInput('timingCoefficient must be a number');
  }
}

/**
 * Normalizes difficulty score to a 0–100 range for weighted aggregation.
 * Uses a sigmoid-like scaling to map raw OHM difficulty to a bounded range.
 */
function normalizeDifficulty(difficultyScore: number): number {
  if (difficultyScore <= 0) return 0;

  // Map raw difficulty to 0-100 using a soft cap at ~100 OHM points
  const normalized = Math.min(100, (difficultyScore / 100) * 100);
  return Math.round(normalized);
}

/**
 * Applies the meaning-first rule: if meaning is very low, cap the final score
 * to prevent timing/difficulty from rescuing a fundamentally wrong answer.
 */
function applyMeaningFirstRule(
  rawScore: number,
  meaningScore: number
): number {
  // If meaning is below 20 (mismatch territory), cap score at meaningScore
  if (meaningScore < 20) {
    return Math.min(rawScore, meaningScore);
  }

  // If meaning is below 40 (partial territory), apply a penalty
  if (meaningScore < 40) {
    const penalty = (40 - meaningScore) / 40;
    return Math.round(rawScore * (1 - penalty * 0.5));
  }

  return rawScore;
}

/**
 * Applies difficulty adjustment: harder sentences allow higher reward potential
 * when meaning is preserved.
 */
function calculateDifficultyBonus(
  meaningScore: number,
  normalizedDifficulty: number
): number {
  if (meaningScore < 50 || normalizedDifficulty < 10) return 0;

  // Bonus scales with both meaning preservation and difficulty
  const meaningFactor = (meaningScore - 50) / 50; // 0 to 1
  const difficultyFactor = Math.min(1, normalizedDifficulty / 80); // 0 to 1

  return Math.round(meaningFactor * difficultyFactor * 15);
}

/**
 * Generates the verdict summary from the aggregation result.
 */
function generateVerdict(
  roundScore: number,
  meaning: MeaningResult,
  timing: TimingResult
): string {
  const parts: string[] = [];

  if (roundScore >= 80) parts.push('Excellent round performance.');
  else if (roundScore >= 60) parts.push('Good round performance.');
  else if (roundScore >= 40) parts.push('Fair round performance.');
  else if (roundScore >= 20) parts.push('Weak round performance.');
  else parts.push('Poor round performance.');

  parts.push(`Meaning: ${meaning.decision}.`);

  if (timing.isTimeout) {
    parts.push('Response timed out.');
  } else if (timing.timingCoefficient >= 0.9) {
    parts.push('Quick response.');
  } else if (timing.timingCoefficient <= 0.5) {
    parts.push('Slow response.');
  }

  return parts.join(' ');
}

/**
 * Aggregates component scores into the final round score.
 * AC5.1: Meaning component must remain dominant factor.
 * AC5.2: Same inputs must always reproduce same round score.
 * AC5.3: Aggregation function must return full component trace for audit.
 */
export function aggregateRoundScore(input: AggregationInput): AggregationResult {
  validateAggregationInput(input);

  const weights: WeightProfile = {
    ...DEFAULT_WEIGHT_PROFILE,
    ...input.weights,
  };

  const { meaning, difficulty, timing } = input;

  // Normalize components to 0–100
  const meaningComponent = meaning.meaningScore;
  const normalizedDifficulty = normalizeDifficulty(difficulty.difficultyScore);
  const timingComponent = Math.round(timing.timingCoefficient * 100);

  // Weighted sum
  const meaningContribution = Math.round(meaningComponent * weights.meaningWeight);
  const difficultyContribution = Math.round(normalizedDifficulty * weights.difficultyWeight);
  const timingContribution = Math.round(timingComponent * weights.timingWeight);

  let rawScore = meaningContribution + difficultyContribution + timingContribution;

  // Apply difficulty bonus for hard sentences with good meaning preservation
  const difficultyBonus = calculateDifficultyBonus(meaningComponent, normalizedDifficulty);
  rawScore += difficultyBonus;

  // Apply meaning-first rule
  rawScore = applyMeaningFirstRule(rawScore, meaningComponent);

  // Handle timeout decision override
  if (meaning.decision === 'timeout') {
    rawScore = 0;
  }

  const roundScore = Math.max(0, Math.min(100, rawScore));

  const formula = [
    `meaning(${meaningComponent} × ${weights.meaningWeight} = ${meaningContribution})`,
    `+ difficulty(${normalizedDifficulty} × ${weights.difficultyWeight} = ${difficultyContribution})`,
    `+ timing(${timingComponent} × ${weights.timingWeight} = ${timingContribution})`,
    difficultyBonus > 0 ? `+ difficultyBonus(${difficultyBonus})` : '',
    `= ${roundScore}`,
  ].filter(Boolean).join(' ');

  const trace: AggregationTrace = {
    baseOhm: difficulty.baseOhm,
    lengthCoefficient: difficulty.lengthCoefficient,
    timingCoefficient: timing.timingCoefficient,
    difficultyScore: difficulty.difficultyScore,
    meaningScore: meaning.meaningScore,
    formula,
  };

  return {
    roundScore,
    components: {
      meaningContribution,
      difficultyContribution,
      timingContribution,
    },
    verdict: generateVerdict(roundScore, meaning, timing),
    trace,
  };
}
