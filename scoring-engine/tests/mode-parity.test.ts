import { describe, it, expect } from 'vitest';
import { ScoringEngine } from '../src/index.js';
import type { GameMode } from '../src/types.js';

describe('Mode Parity Tests', () => {
  it('same transcript/timing fixture in faceoff and room modes produce same scoring output', async () => {
    const engine = new ScoringEngine();

    const players = [
      { playerId: 'p1', displayName: 'Alice' },
      { playerId: 'p2', displayName: 'Bob' },
    ];

    const faceoffMatch = await engine.createMatch('faceoff', players);
    const roomMatch = await engine.createMatch('room', players);

    const captainTranscript = 'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi.';
    const crewTranscript = 'From now on, remember that sweet words can be deceptive.';
    const captainStopTimestamp = 1000;
    const crewStartTimestamp = 2500;

    const faceoffResult = await engine.scoreRound({
      matchId: faceoffMatch.matchId,
      mode: 'faceoff',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript,
      crewTranscript,
      captainStopTimestamp,
      crewStartTimestamp,
    });

    const roomResult = await engine.scoreRound({
      matchId: roomMatch.matchId,
      mode: 'room',
      captainPlayerId: 'p1',
      crewPlayerId: 'p2',
      captainTranscript,
      crewTranscript,
      captainStopTimestamp,
      crewStartTimestamp,
    });

    expect(faceoffResult.success).toBe(true);
    expect(roomResult.success).toBe(true);

    if (faceoffResult.success && roomResult.success) {
      // Same scoring semantics across modes
      expect(faceoffResult.round.meaningScore).toBe(roomResult.round.meaningScore);
      expect(faceoffResult.round.difficultyScore).toBe(roomResult.round.difficultyScore);
      expect(faceoffResult.round.timingCoefficient).toBe(roomResult.round.timingCoefficient);
      expect(faceoffResult.round.roundScore).toBe(roomResult.round.roundScore);
      expect(faceoffResult.round.decision).toBe(roomResult.round.decision);
      expect(faceoffResult.round.responseDelayMs).toBe(roomResult.round.responseDelayMs);

      // Mode metadata is different
      expect(faceoffResult.round.mode).toBe('faceoff');
      expect(roomResult.round.mode).toBe('room');
    }
  });

  it('both modes produce valid round records with all required fields', async () => {
    const engine = new ScoringEngine();
    const players = [
      { playerId: 'p1', displayName: 'Alice' },
      { playerId: 'p2', displayName: 'Bob' },
    ];

    const modes: GameMode[] = ['faceoff', 'room'];

    for (const mode of modes) {
      const match = await engine.createMatch(mode, players);

      const result = await engine.scoreRound({
        matchId: match.matchId,
        mode,
        captainPlayerId: 'p1',
        crewPlayerId: 'p2',
        captainTranscript: 'Xin chào bạn.',
        crewTranscript: 'Hello friend.',
        captainStopTimestamp: 0,
        crewStartTimestamp: 1000,
      });

      expect(result.success).toBe(true);

      if (result.success) {
        const round = result.round;

        // Verify all canonical fields exist
        expect(round.roundId).toBeTruthy();
        expect(round.matchId).toBeTruthy();
        expect(round.mode).toBe(mode);
        expect(round.players).toHaveLength(2);
        expect(round.rolesForRound).toBeTruthy();
        expect(round.captainTranscript).toBeTruthy();
        expect(round.crewTranscript).toBeTruthy();
        expect(typeof round.meaningScore).toBe('number');
        expect(round.decision).toBeTruthy();
        expect(typeof round.difficultyScore).toBe('number');
        expect(typeof round.responseDelayMs).toBe('number');
        expect(typeof round.timingCoefficient).toBe('number');
        expect(typeof round.roundScore).toBe('number');
        expect(round.createdAt).toBeTruthy();
        expect(round.configVersion).toBeTruthy();

        // Recommended fields
        expect(Array.isArray(round.missingConcepts)).toBe(true);
        expect(Array.isArray(round.extraConcepts)).toBe(true);
      }
    }
  });
});
