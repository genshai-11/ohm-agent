import type { TimingInput, TimingResult, TimingConfig } from './types.js';
import { DEFAULT_TIMING_CONFIG } from './config.js';
import { invalidInput } from './errors.js';

/**
 * C4: Response Timing Evaluation
 *
 * Measures delay from Captain completion to Crew response start
 * and converts to reaction coefficient.
 *
 * Default deterministic timing baseline:
 * - delay <= 2000ms => timingCoefficient = 1.0
 * - delay >= 5000ms => timingCoefficient = 0.33
 * - 2000ms < delay < 5000ms => linear decay between 1.0 and 0.33
 */

export function validateTimingInput(input: TimingInput): void {
  if (typeof input.captainStopTimestamp !== 'number' || !isFinite(input.captainStopTimestamp)) {
    throw invalidInput('captainStopTimestamp must be a finite number');
  }
  if (typeof input.crewStartTimestamp !== 'number' || !isFinite(input.crewStartTimestamp)) {
    throw invalidInput('crewStartTimestamp must be a finite number');
  }
}

/**
 * Calculates the timing coefficient from a response delay.
 * Guarantees monotonic behavior: higher delay => lower or equal coefficient.
 */
export function calculateTimingCoefficient(delayMs: number, config: TimingConfig): number {
  if (delayMs <= config.fastThresholdMs) {
    return config.maxCoefficient;
  }

  if (delayMs >= config.slowThresholdMs) {
    return config.minCoefficient;
  }

  // Linear decay between fast and slow thresholds
  const range = config.slowThresholdMs - config.fastThresholdMs;
  const valueRange = config.maxCoefficient - config.minCoefficient;
  const progress = (delayMs - config.fastThresholdMs) / range;

  return Number((config.maxCoefficient - progress * valueRange).toFixed(4));
}

/**
 * Evaluates response timing and produces a timing result.
 */
export function evaluateTiming(input: TimingInput): TimingResult {
  validateTimingInput(input);

  const config: TimingConfig = {
    ...DEFAULT_TIMING_CONFIG,
    ...input.config,
  };

  // AC4.1: Delay must be non-negative
  const responseDelayMs = Math.max(0, input.crewStartTimestamp - input.captainStopTimestamp);

  // AC4.3: Timeout state must be explicit and distinguishable from slow response
  const isTimeout = responseDelayMs >= config.timeoutMs;

  const timingCoefficient = isTimeout
    ? config.minCoefficient
    : calculateTimingCoefficient(responseDelayMs, config);

  return {
    responseDelayMs,
    timingCoefficient,
    isTimeout,
  };
}
