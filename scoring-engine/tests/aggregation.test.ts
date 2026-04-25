import { describe, it, expect } from 'vitest';
import { aggregateRoundScore } from '../src/c5-aggregation.js';
import type { MeaningResult, DifficultyResult, TimingResult } from '../src/types.js';

function makeMeaning(overrides: Partial<MeaningResult> = {}): MeaningResult {
  return {
    meaningScore: 80,
    decision: 'match',
    reason: 'Good meaning preservation.',
    missingConcepts: [],
    extraConcepts: [],
    ...overrides,
  };
}

function makeDifficulty(overrides: Partial<DifficultyResult> = {}): DifficultyResult {
  return {
    difficultyScore: 30,
    chunks: [
      { text: 'test chunk', label: 'RED', confidence: 0.9, reason: 'Test' },
    ],
    baseOhm: 15,
    lengthBucket: 'short',
    lengthCoefficient: 1.5,
    sentenceCount: 2,
    wordCount: 20,
    formula: '15 × 1.5 = 22.5',
    ...overrides,
  };
}

function makeTiming(overrides: Partial<TimingResult> = {}): TimingResult {
  return {
    responseDelayMs: 1500,
    timingCoefficient: 1.0,
    isTimeout: false,
    ...overrides,
  };
}

describe('C5: Round Score Aggregation', () => {
  describe('fixed fixture inputs return deterministic round scores (AC5.2)', () => {
    it('should produce same score for same inputs', () => {
      const meaning = makeMeaning();
      const difficulty = makeDifficulty();
      const timing = makeTiming();

      const r1 = aggregateRoundScore({ meaning, difficulty, timing });
      const r2 = aggregateRoundScore({ meaning, difficulty, timing });

      expect(r1.roundScore).toBe(r2.roundScore);
      expect(r1.components).toEqual(r2.components);
      expect(r1.trace.formula).toBe(r2.trace.formula);
    });

    it('should return score between 0 and 100', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning(),
        difficulty: makeDifficulty(),
        timing: makeTiming(),
      });

      expect(result.roundScore).toBeGreaterThanOrEqual(0);
      expect(result.roundScore).toBeLessThanOrEqual(100);
    });
  });

  describe('meaning-first rule (AC5.1)', () => {
    it('high meaning mismatch cannot be rescued by fast timing', () => {
      const lowMeaning = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 10, decision: 'mismatch' }),
        difficulty: makeDifficulty({ difficultyScore: 100 }),
        timing: makeTiming({ timingCoefficient: 1.0 }),
      });

      // Score should be capped by the low meaning score
      expect(lowMeaning.roundScore).toBeLessThanOrEqual(15);
    });

    it('meaning should be the dominant factor', () => {
      const highMeaning = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 90 }),
        difficulty: makeDifficulty({ difficultyScore: 10 }),
        timing: makeTiming({ timingCoefficient: 0.5 }),
      });

      const lowMeaning = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 20, decision: 'mismatch' }),
        difficulty: makeDifficulty({ difficultyScore: 10 }),
        timing: makeTiming({ timingCoefficient: 0.5 }),
      });

      expect(highMeaning.roundScore).toBeGreaterThan(lowMeaning.roundScore);
    });
  });

  describe('component traces align with final score (AC5.3)', () => {
    it('should include all trace fields', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning(),
        difficulty: makeDifficulty(),
        timing: makeTiming(),
      });

      expect(typeof result.trace.baseOhm).toBe('number');
      expect(typeof result.trace.lengthCoefficient).toBe('number');
      expect(typeof result.trace.timingCoefficient).toBe('number');
      expect(typeof result.trace.difficultyScore).toBe('number');
      expect(typeof result.trace.meaningScore).toBe('number');
      expect(typeof result.trace.formula).toBe('string');
      expect(result.trace.formula.length).toBeGreaterThan(0);
    });

    it('should include component contributions', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning(),
        difficulty: makeDifficulty(),
        timing: makeTiming(),
      });

      expect(typeof result.components.meaningContribution).toBe('number');
      expect(typeof result.components.difficultyContribution).toBe('number');
      expect(typeof result.components.timingContribution).toBe('number');
    });

    it('should include a verdict summary', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning(),
        difficulty: makeDifficulty(),
        timing: makeTiming(),
      });

      expect(typeof result.verdict).toBe('string');
      expect(result.verdict.length).toBeGreaterThan(0);
    });
  });

  describe('difficulty adjustment', () => {
    it('harder source with good meaning should score higher than easy source', () => {
      const hard = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 85 }),
        difficulty: makeDifficulty({ difficultyScore: 80, baseOhm: 40 }),
        timing: makeTiming(),
      });

      const easy = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 85 }),
        difficulty: makeDifficulty({ difficultyScore: 5, baseOhm: 5 }),
        timing: makeTiming(),
      });

      expect(hard.roundScore).toBeGreaterThan(easy.roundScore);
    });
  });

  describe('timing influence', () => {
    it('faster response should produce higher or equal score', () => {
      const fast = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 75 }),
        difficulty: makeDifficulty(),
        timing: makeTiming({ timingCoefficient: 1.0 }),
      });

      const slow = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 75 }),
        difficulty: makeDifficulty(),
        timing: makeTiming({ timingCoefficient: 0.33 }),
      });

      expect(fast.roundScore).toBeGreaterThanOrEqual(slow.roundScore);
    });
  });

  describe('timeout handling', () => {
    it('should return 0 for timeout decision', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 80, decision: 'timeout' }),
        difficulty: makeDifficulty(),
        timing: makeTiming({ isTimeout: true, timingCoefficient: 0.33 }),
      });

      expect(result.roundScore).toBe(0);
    });
  });

  describe('custom weight profiles', () => {
    it('should accept custom weights', () => {
      const result = aggregateRoundScore({
        meaning: makeMeaning({ meaningScore: 100 }),
        difficulty: makeDifficulty({ difficultyScore: 0 }),
        timing: makeTiming({ timingCoefficient: 0 }),
        weights: { meaningWeight: 1.0, difficultyWeight: 0, timingWeight: 0 },
      });

      // With all weight on meaning at 100, score should be high
      expect(result.roundScore).toBeGreaterThanOrEqual(90);
    });
  });
});
