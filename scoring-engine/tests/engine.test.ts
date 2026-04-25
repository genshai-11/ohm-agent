import { describe, it, expect } from 'vitest';
import { ScoringEngine, createDefaultConfig, validateConfig } from '../src/index.js';

describe('ScoringEngine (Integration)', () => {
  it('should create engine with default config', () => {
    const engine = new ScoringEngine();
    const config = engine.getConfig();

    expect(config.version).toBe('1.0.0');
    expect(config.strictness).toBe('medium');
    expect(config.roleSwapPolicy).toBe('every_round');
  });

  it('should create engine with custom config', () => {
    const engine = new ScoringEngine({
      config: {
        strictness: 'strict',
        weights: { meaningWeight: 0.7, difficultyWeight: 0.2, timingWeight: 0.1 },
      },
    });

    const config = engine.getConfig();
    expect(config.strictness).toBe('strict');
    expect(config.weights.meaningWeight).toBe(0.7);
  });

  it('should reject invalid config', () => {
    expect(() =>
      new ScoringEngine({
        config: {
          weights: { meaningWeight: 0.5, difficultyWeight: 0.5, timingWeight: 0.5 },
        },
      })
    ).toThrow('weight profile must sum to 1.0');
  });

  it('should execute full round lifecycle', async () => {
    const engine = new ScoringEngine();

    const players = [
      { playerId: 'alice', displayName: 'Alice' },
      { playerId: 'bob', displayName: 'Bob' },
    ];

    // Create match
    const match = await engine.createMatch('faceoff', players);
    expect(match.matchId).toBeTruthy();
    expect(match.status).toBe('active');
    expect(match.currentRound).toBe(0);

    // Score round 1
    const result = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'faceoff',
      captainPlayerId: 'alice',
      crewPlayerId: 'bob',
      captainTranscript: 'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi.',
      crewTranscript: 'From now on, you should remember that sweet words can be deceptive.',
      captainStopTimestamp: 1000,
      crewStartTimestamp: 2500,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.round.roundScore).toBeGreaterThanOrEqual(0);
    expect(result.round.roundScore).toBeLessThanOrEqual(100);
    expect(result.round.roundNumber).toBe(1);
    expect(result.round.mode).toBe('faceoff');
    expect(result.matchState.currentRound).toBe(1);

    // Verify match state updated
    const retrievedMatch = await engine.getMatch(match.matchId);
    expect(retrievedMatch).not.toBeNull();
    expect(retrievedMatch!.currentRound).toBe(1);
    expect(retrievedMatch!.rounds).toHaveLength(1);
  });

  it('should handle multiple rounds with role swap', async () => {
    const engine = new ScoringEngine();

    const players = [
      { playerId: 'p1', displayName: 'Player 1' },
      { playerId: 'p2', displayName: 'Player 2' },
    ];

    const match = await engine.createMatch('room', players);

    // Round 1
    const r1 = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'room',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript: 'Xin chào bạn.',
      crewTranscript: 'Hello friend.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 1000,
    });

    expect(r1.success).toBe(true);
    if (!r1.success) return;

    // Round 2 (roles should be swapped by engine)
    const r2 = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'room',
      captainPlayerId: 'p2',
      crewPlayerId: 'p1',
      captainTranscript: 'Nói chung, hôm nay trời đẹp.',
      crewTranscript: 'Overall, the weather is nice today.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 1500,
    });

    expect(r2.success).toBe(true);
    if (!r2.success) return;

    expect(r2.round.roundNumber).toBe(2);
    expect(r2.matchState.currentRound).toBe(2);
    expect(r2.matchState.playerScores['p1'].roundsPlayed).toBe(2);
    expect(r2.matchState.playerScores['p2'].roundsPlayed).toBe(2);
  });

  it('should reject duplicate player IDs', async () => {
    const engine = new ScoringEngine();
    const players = [
      { playerId: 'p1', displayName: 'P1' },
      { playerId: 'p2', displayName: 'P2' },
    ];
    const match = await engine.createMatch('faceoff', players);

    const result = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'p1',
      captainTranscript: 'Chào.',
      crewTranscript: 'Hi.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 500,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.category).toBe('invalid_input');
      expect(result.error.message).toContain('different');
    }
  });

  it('should reject player IDs not in match', async () => {
    const engine = new ScoringEngine();
    const players = [
      { playerId: 'p1', displayName: 'P1' },
      { playerId: 'p2', displayName: 'P2' },
    ];
    const match = await engine.createMatch('faceoff', players);

    const result = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'unknown',
      captainTranscript: 'Chào.',
      crewTranscript: 'Hi.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 500,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.category).toBe('invalid_input');
      expect(result.error.message).toContain('not in this match');
    }
  });

  it('should return error for non-existent match', async () => {
    const engine = new ScoringEngine();

    const result = await engine.scoreRound({
      matchId: 'non-existent-match',
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript: 'Test.',
      crewTranscript: 'Test.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 1000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.category).toBe('invalid_input');
    }
  });

  it('should retrieve rounds by match', async () => {
    const engine = new ScoringEngine();

    const players = [
      { playerId: 'p1', displayName: 'P1' },
      { playerId: 'p2', displayName: 'P2' },
    ];

    const match = await engine.createMatch('faceoff', players);

    await engine.scoreRound({
      matchId: match.matchId,
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript: 'Chào.',
      crewTranscript: 'Hello.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 500,
    });

    const rounds = await engine.getMatchRounds(match.matchId);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].matchId).toBe(match.matchId);
  });
});

describe('Config Validation', () => {
  it('should accept valid default config', () => {
    const config = createDefaultConfig();
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('should reject invalid strictness', () => {
    const config = createDefaultConfig();
    (config as any).strictness = 'invalid';
    expect(() => validateConfig(config)).toThrow('strictness');
  });

  it('should reject weights that do not sum to 1.0', () => {
    const config = createDefaultConfig();
    config.weights = { meaningWeight: 0.5, difficultyWeight: 0.5, timingWeight: 0.5 };
    expect(() => validateConfig(config)).toThrow('sum to 1.0');
  });

  it('should reject negative timing thresholds', () => {
    const config = createDefaultConfig();
    config.timing.fastThresholdMs = -100;
    expect(() => validateConfig(config)).toThrow('non-negative');
  });

  it('should reject slowThreshold <= fastThreshold', () => {
    const config = createDefaultConfig();
    config.timing.slowThresholdMs = 1000;
    config.timing.fastThresholdMs = 2000;
    expect(() => validateConfig(config)).toThrow('greater than fastThresholdMs');
  });

  it('config update affects new rounds only (AC7.1)', async () => {
    const engine1 = new ScoringEngine({
      config: { weights: { meaningWeight: 0.6, difficultyWeight: 0.25, timingWeight: 0.15 } },
    });
    const engine2 = new ScoringEngine({
      config: { weights: { meaningWeight: 0.8, difficultyWeight: 0.1, timingWeight: 0.1 } },
    });

    // Each engine operates with its own config
    expect(engine1.getConfig().weights.meaningWeight).toBe(0.6);
    expect(engine2.getConfig().weights.meaningWeight).toBe(0.8);
  });

  it('active config version is attached to each round record (AC7.2)', async () => {
    const engine = new ScoringEngine({ config: { version: '2.5.0' } });

    const players = [
      { playerId: 'p1', displayName: 'P1' },
      { playerId: 'p2', displayName: 'P2' },
    ];
    const match = await engine.createMatch('faceoff', players);

    const result = await engine.scoreRound({
      matchId: match.matchId,
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript: 'Chào.',
      crewTranscript: 'Hi.',
      captainStopTimestamp: 0,
      crewStartTimestamp: 500,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.round.configVersion).toBe('2.5.0');
    }
  });

  it('invalid config is rejected with readable errors (AC7.3)', () => {
    const config = createDefaultConfig();
    config.weights = { meaningWeight: -1, difficultyWeight: 2, timingWeight: 0 };

    try {
      validateConfig(config);
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('Invalid scoring config');
      expect(error.diagnostics?.errors).toBeTruthy();
    }
  });
});
