import { describe, it, expect } from 'vitest';
import { evaluateTiming, calculateTimingCoefficient } from '../src/c4-timing.js';
import { DEFAULT_TIMING_CONFIG } from '../src/config.js';

describe('C4: Response Timing Evaluation', () => {
  describe('immediate response => top coefficient', () => {
    it('should return 1.0 for delay <= 2000ms', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 1000,
        crewStartTimestamp: 2000,
      });

      expect(result.responseDelayMs).toBe(1000);
      expect(result.timingCoefficient).toBe(1.0);
      expect(result.isTimeout).toBe(false);
    });

    it('should return 1.0 for exactly 2000ms', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 2000,
      });

      expect(result.timingCoefficient).toBe(1.0);
    });

    it('should return 1.0 for 0ms delay', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 5000,
        crewStartTimestamp: 5000,
      });

      expect(result.responseDelayMs).toBe(0);
      expect(result.timingCoefficient).toBe(1.0);
    });
  });

  describe('delayed response => reduced coefficient', () => {
    it('should return value between 0.33 and 1.0 for 3500ms delay', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 3500,
      });

      expect(result.timingCoefficient).toBeGreaterThan(0.33);
      expect(result.timingCoefficient).toBeLessThan(1.0);
      expect(result.isTimeout).toBe(false);
    });

    it('should return 0.33 for delay >= 5000ms', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 5000,
      });

      expect(result.timingCoefficient).toBeCloseTo(0.33, 1);
    });

    it('should return 0.33 for very long delay (but not timeout)', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 10000,
      });

      expect(result.timingCoefficient).toBeCloseTo(0.33, 1);
      expect(result.isTimeout).toBe(false);
    });
  });

  describe('timeout => timeout decision', () => {
    it('should mark as timeout for delay >= 30000ms', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 30000,
      });

      expect(result.isTimeout).toBe(true);
      expect(result.timingCoefficient).toBeCloseTo(0.33, 1);
    });

    it('should mark as timeout for custom timeout threshold', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 15000,
        config: { timeoutMs: 10000 },
      });

      expect(result.isTimeout).toBe(true);
    });
  });

  describe('monotonicity', () => {
    it('higher delay => lower or equal coefficient (AC4.2)', () => {
      const delays = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 6000, 10000];
      const coefficients = delays.map(d =>
        calculateTimingCoefficient(d, DEFAULT_TIMING_CONFIG)
      );

      for (let i = 1; i < coefficients.length; i++) {
        expect(coefficients[i]).toBeLessThanOrEqual(coefficients[i - 1]);
      }
    });
  });

  describe('non-negative delay (AC4.1)', () => {
    it('should produce non-negative delay even if crew starts before captain stops', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 5000,
        crewStartTimestamp: 3000,
      });

      expect(result.responseDelayMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('input validation', () => {
    it('should throw on non-finite captainStopTimestamp', () => {
      expect(() =>
        evaluateTiming({
          captainStopTimestamp: NaN,
          crewStartTimestamp: 1000,
        })
      ).toThrow('captainStopTimestamp');
    });

    it('should throw on non-finite crewStartTimestamp', () => {
      expect(() =>
        evaluateTiming({
          captainStopTimestamp: 0,
          crewStartTimestamp: Infinity,
        })
      ).toThrow('crewStartTimestamp');
    });
  });

  describe('linear decay', () => {
    it('should have approximately midpoint coefficient at 3500ms', () => {
      const result = evaluateTiming({
        captainStopTimestamp: 0,
        crewStartTimestamp: 3500,
      });

      // Midpoint of 2000-5000 range, coefficient should be midpoint of 1.0-0.33
      const expectedMid = 1.0 - ((3500 - 2000) / (5000 - 2000)) * (1.0 - 0.33);
      expect(result.timingCoefficient).toBeCloseTo(expectedMid, 2);
    });
  });

  describe('determinism', () => {
    it('same inputs produce same outputs', () => {
      const r1 = evaluateTiming({ captainStopTimestamp: 0, crewStartTimestamp: 3000 });
      const r2 = evaluateTiming({ captainStopTimestamp: 0, crewStartTimestamp: 3000 });

      expect(r1.responseDelayMs).toBe(r2.responseDelayMs);
      expect(r1.timingCoefficient).toBe(r2.timingCoefficient);
      expect(r1.isTimeout).toBe(r2.isTimeout);
    });
  });
});
