import { describe, it, expect } from 'vitest';
import {
  DeterministicDifficultyEvaluator,
  evaluateDifficulty,
} from '../src/c3-difficulty.js';
import { DEFAULT_OHM_WEIGHTS } from '../src/config.js';
import type { DifficultyEvaluator, DifficultyInput, DifficultyResult, OhmChunk } from '../src/types.js';

describe('C3: Semantic Difficulty (OHM) Evaluation', () => {
  const evaluator = new DeterministicDifficultyEvaluator();

  describe('deterministic scoring baseline', () => {
    it('should produce deterministic output for identical input (AC3.1)', async () => {
      const transcript = 'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi.';
      const r1 = await evaluateDifficulty(transcript, evaluator);
      const r2 = await evaluateDifficulty(transcript, evaluator);

      expect(r1.difficultyScore).toBe(r2.difficultyScore);
      expect(r1.baseOhm).toBe(r2.baseOhm);
      expect(r1.lengthBucket).toBe(r2.lengthBucket);
      expect(r1.lengthCoefficient).toBe(r2.lengthCoefficient);
      expect(r1.formula).toBe(r2.formula);
    });

    it('should expose explainability fields (AC3.2)', async () => {
      const result = await evaluateDifficulty(
        'Nói chung, nếu cậu mà biết nghĩ thì cậu đâu có đổ thêm dầu vào lửa.',
        evaluator
      );

      expect(Array.isArray(result.chunks)).toBe(true);
      expect(typeof result.formula).toBe('string');
      expect(typeof result.baseOhm).toBe('number');
      expect(typeof result.lengthCoefficient).toBe('number');
      expect(typeof result.lengthBucket).toBe('string');
      expect(typeof result.sentenceCount).toBe('number');
      expect(typeof result.wordCount).toBe('number');
    });

    it('should calculate correct length bucket for veryShort text', async () => {
      const result = await evaluateDifficulty('Chào bạn.', evaluator);
      expect(result.lengthBucket).toBe('veryShort');
      expect(result.lengthCoefficient).toBe(1.0);
    });

    it('should calculate correct length bucket for medium text', async () => {
      const result = await evaluateDifficulty(
        'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi. Đừng có tham lam quá. Nói chung là vậy.',
        evaluator
      );
      // 3 sentences, should be medium
      expect(['short', 'medium']).toContain(result.lengthBucket);
    });
  });

  describe('chunk validation', () => {
    it('should validate chunks are exact substrings (AC3.5)', async () => {
      const transcript = 'Mật ngọt chết ruồi, đổ thêm dầu vào lửa.';

      const mockEvaluator: DifficultyEvaluator = {
        async evaluate(): Promise<DifficultyResult> {
          return {
            difficultyScore: 0,
            chunks: [
              { text: 'mật ngọt chết ruồi', label: 'RED', confidence: 0.99, reason: 'Idiom' },
              { text: 'đổ thêm dầu vào lửa', label: 'RED', confidence: 0.99, reason: 'Idiom' },
              { text: 'NOT IN TRANSCRIPT', label: 'PINK', confidence: 0.8, reason: 'Test' },
            ],
            baseOhm: 0,
            lengthBucket: 'veryShort',
            lengthCoefficient: 1.0,
            sentenceCount: 1,
            wordCount: 8,
            formula: '',
          };
        },
      };

      const result = await evaluateDifficulty(transcript, mockEvaluator);

      // The "NOT IN TRANSCRIPT" chunk should be filtered out
      expect(result.chunks.length).toBe(2);
      expect(result.chunks.every(c => transcript.toLowerCase().includes(c.text.toLowerCase()))).toBe(true);
    });

    it('should filter out chunks with invalid labels', async () => {
      const transcript = 'Xin chào bạn.';

      const mockEvaluator: DifficultyEvaluator = {
        async evaluate(): Promise<DifficultyResult> {
          return {
            difficultyScore: 0,
            chunks: [
              { text: 'xin chào', label: 'GREEN', confidence: 0.9, reason: 'Opener' },
              { text: 'bạn', label: 'INVALID' as any, confidence: 0.5, reason: 'Bad' },
            ],
            baseOhm: 0,
            lengthBucket: 'veryShort',
            lengthCoefficient: 1.0,
            sentenceCount: 1,
            wordCount: 3,
            formula: '',
          };
        },
      };

      const result = await evaluateDifficulty(transcript, mockEvaluator);
      expect(result.chunks.every(c => ['GREEN', 'BLUE', 'RED', 'PINK'].includes(c.label))).toBe(true);
    });
  });

  describe('OHM weight application', () => {
    it('should apply correct weights per label (RED=9, BLUE=7, GREEN=5, PINK=3)', async () => {
      const transcript = 'Mật ngọt chết ruồi. Nếu cậu mà biết nghĩ. Từ bây giờ. Tẩy não.';

      const mockEvaluator: DifficultyEvaluator = {
        async evaluate(): Promise<DifficultyResult> {
          return {
            difficultyScore: 0,
            chunks: [
              { text: 'mật ngọt chết ruồi', label: 'RED', confidence: 0.99, reason: 'Idiom' },
              { text: 'nếu cậu mà biết nghĩ', label: 'BLUE', confidence: 0.9, reason: 'Frame' },
              { text: 'từ bây giờ', label: 'GREEN', confidence: 0.9, reason: 'Opener' },
              { text: 'tẩy não', label: 'PINK', confidence: 0.85, reason: 'Term' },
            ],
            baseOhm: 0,
            lengthBucket: 'veryShort',
            lengthCoefficient: 1.0,
            sentenceCount: 4,
            wordCount: 15,
            formula: '',
          };
        },
      };

      const result = await evaluateDifficulty(transcript, mockEvaluator);
      // RED(9) + BLUE(7) + GREEN(5) + PINK(3) = 24
      expect(result.baseOhm).toBe(24);
    });
  });

  describe('graceful fallback (AC3.3)', () => {
    it('should throw typed error when evaluator fails', async () => {
      const failingEvaluator: DifficultyEvaluator = {
        async evaluate(): Promise<DifficultyResult> {
          throw new Error('LLM API unreachable');
        },
      };

      await expect(
        evaluateDifficulty('Test transcript.', failingEvaluator)
      ).rejects.toThrow('Difficulty evaluation failed');
    });
  });

  describe('input validation', () => {
    it('should throw on empty transcript', async () => {
      await expect(
        evaluateDifficulty('', evaluator)
      ).rejects.toThrow('captainTranscript');
    });

    it('should throw on whitespace-only transcript', async () => {
      await expect(
        evaluateDifficulty('   ', evaluator)
      ).rejects.toThrow('captainTranscript');
    });
  });
});
