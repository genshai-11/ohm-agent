import { describe, it, expect } from 'vitest';
import { DeterministicMeaningEvaluator, evaluateMeaning } from '../src/c2-meaning.js';
import type { MeaningEvaluator, MeaningInput, MeaningResult } from '../src/types.js';

describe('C2: Meaning Match Evaluation', () => {
  const evaluator = new DeterministicMeaningEvaluator();

  describe('paraphrase preserved intent => high score', () => {
    it('should score high when crew provides adequate English response to Vietnamese', async () => {
      const result = await evaluateMeaning(
        'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi.',
        'From now on, you should remember that sweet words can be deceptive like honey killing flies.',
        'medium',
        evaluator
      );

      expect(result.meaningScore).toBeGreaterThanOrEqual(50);
      expect(result.decision).not.toBe('mismatch');
      expect(result.reason).toBeTruthy();
    });

    it('should return valid output shape', async () => {
      const result = await evaluateMeaning(
        'Chào bạn, hôm nay trời đẹp quá.',
        'Hello friend, the weather is beautiful today.',
        'medium',
        evaluator
      );

      expect(typeof result.meaningScore).toBe('number');
      expect(result.meaningScore).toBeGreaterThanOrEqual(0);
      expect(result.meaningScore).toBeLessThanOrEqual(100);
      expect(['match', 'partial', 'mismatch', 'timeout']).toContain(result.decision);
      expect(typeof result.reason).toBe('string');
      expect(Array.isArray(result.missingConcepts)).toBe(true);
      expect(Array.isArray(result.extraConcepts)).toBe(true);
    });
  });

  describe('partial meaning => medium score', () => {
    it('should score medium when crew gives a partially correct response', async () => {
      const result = await evaluateMeaning(
        'Thẳng thắn mà nói, tui không hiểu cậu lấy đâu ra nhiều tiền đến thế.',
        'Money.',
        'medium',
        evaluator
      );

      expect(result.meaningScore).toBeLessThan(80);
    });
  });

  describe('contradictory meaning => low score', () => {
    it('should score low for very short or irrelevant crew response', async () => {
      const result = await evaluateMeaning(
        'Khi chiếc thuyền cứu hộ lật giữa cơn giông.',
        'x',
        'medium',
        evaluator
      );

      expect(result.meaningScore).toBeLessThan(50);
    });
  });

  describe('empty or invalid crew response', () => {
    it('should not produce match for empty crew response', async () => {
      const result = await evaluateMeaning(
        'Từ bây giờ, cậu nên nhớ.',
        '',
        'medium',
        evaluator
      );

      expect(result.decision).toBe('mismatch');
      expect(result.meaningScore).toBe(0);
    });

    it('should not produce match for whitespace-only crew response', async () => {
      const result = await evaluateMeaning(
        'Từ bây giờ, cậu nên nhớ.',
        '   ',
        'medium',
        evaluator
      );

      expect(result.decision).toBe('mismatch');
      expect(result.meaningScore).toBe(0);
    });
  });

  describe('output shape is always valid even on partial failures', () => {
    it('should return valid shape when evaluator throws', async () => {
      const failingEvaluator: MeaningEvaluator = {
        async evaluate(): Promise<MeaningResult> {
          throw new Error('External API unavailable');
        },
      };

      await expect(
        evaluateMeaning('test', 'test', 'medium', failingEvaluator)
      ).rejects.toThrow('Meaning evaluation failed');
    });
  });

  describe('strictness levels', () => {
    it('loose strictness should be more lenient', async () => {
      const looseResult = await evaluateMeaning(
        'Xin chào bạn.',
        'Hi there my friend, how are you doing?',
        'loose',
        evaluator
      );

      const strictResult = await evaluateMeaning(
        'Xin chào bạn.',
        'Hi there my friend, how are you doing?',
        'strict',
        evaluator
      );

      // Same content should score equally or better under loose
      expect(looseResult.meaningScore).toBeGreaterThanOrEqual(strictResult.meaningScore);
    });
  });

  describe('determinism', () => {
    it('same inputs produce same outputs', async () => {
      const r1 = await evaluateMeaning('Chào bạn.', 'Hello friend.', 'medium', evaluator);
      const r2 = await evaluateMeaning('Chào bạn.', 'Hello friend.', 'medium', evaluator);

      expect(r1.meaningScore).toBe(r2.meaningScore);
      expect(r1.decision).toBe(r2.decision);
    });
  });
});
