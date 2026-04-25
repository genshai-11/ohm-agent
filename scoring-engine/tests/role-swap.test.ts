import { describe, it, expect } from 'vitest';
import {
  determineRoles,
  createMatch,
  addRoundToMatch,
  buildRoundRecord,
  updatePlayerScores,
} from '../src/c6-persistence.js';
import type { PlayerIdentity, PlayerScore, MeaningResult, DifficultyResult, TimingResult, AggregationResult } from '../src/types.js';

const player1: PlayerIdentity = { playerId: 'p1', displayName: 'Alice' };
const player2: PlayerIdentity = { playerId: 'p2', displayName: 'Bob' };
const players = [player1, player2];

function makeRoundData() {
  const meaning: MeaningResult = {
    meaningScore: 75,
    decision: 'match',
    reason: 'Good match.',
    missingConcepts: [],
    extraConcepts: [],
  };

  const difficulty: DifficultyResult = {
    difficultyScore: 20,
    chunks: [],
    baseOhm: 10,
    lengthBucket: 'short',
    lengthCoefficient: 1.5,
    sentenceCount: 2,
    wordCount: 15,
    formula: '10 × 1.5 = 15',
  };

  const timing: TimingResult = {
    responseDelayMs: 1500,
    timingCoefficient: 1.0,
    isTimeout: false,
  };

  const aggregation: AggregationResult = {
    roundScore: 70,
    components: { meaningContribution: 45, difficultyContribution: 5, timingContribution: 15 },
    verdict: 'Good round.',
    trace: {
      baseOhm: 10,
      lengthCoefficient: 1.5,
      timingCoefficient: 1.0,
      difficultyScore: 20,
      meaningScore: 75,
      formula: 'test formula',
    },
  };

  return { meaning, difficulty, timing, aggregation };
}

describe('Role Swap and Identity Tracking', () => {
  describe('role determination', () => {
    it('should assign initial roles on first round', () => {
      const roles = determineRoles(players, {}, 1, 'every_round');

      expect(roles[player1.playerId]).toBe('captain');
      expect(roles[player2.playerId]).toBe('crew');
    });

    it('should swap roles every round', () => {
      const round1Roles = determineRoles(players, {}, 1, 'every_round');
      const round2Roles = determineRoles(players, round1Roles, 2, 'every_round');

      expect(round2Roles[player1.playerId]).toBe('crew');
      expect(round2Roles[player2.playerId]).toBe('captain');

      const round3Roles = determineRoles(players, round2Roles, 3, 'every_round');
      expect(round3Roles[player1.playerId]).toBe('captain');
      expect(round3Roles[player2.playerId]).toBe('crew');
    });

    it('should swap roles every two rounds', () => {
      const r1 = determineRoles(players, {}, 1, 'every_two');
      // Round 2: even → no swap
      const r2 = determineRoles(players, r1, 2, 'every_two');
      expect(r2[player1.playerId]).toBe(r1[player1.playerId]);

      // Round 3: odd → swap
      const r3 = determineRoles(players, r2, 3, 'every_two');
      expect(r3[player1.playerId]).not.toBe(r2[player1.playerId]);
    });

    it('should keep roles with manual policy', () => {
      const r1 = determineRoles(players, {}, 1, 'manual');
      const r2 = determineRoles(players, r1, 2, 'manual');

      expect(r2[player1.playerId]).toBe(r1[player1.playerId]);
      expect(r2[player2.playerId]).toBe(r1[player2.playerId]);
    });
  });

  describe('swap keeps player score continuity (AC6.1)', () => {
    it('same player continues same cumulative score lineage after swap', () => {
      const { meaning, difficulty, timing, aggregation } = makeRoundData();

      const match = createMatch({
        mode: 'faceoff',
        players,
        roleSwapPolicy: 'every_round',
        configVersion: '1.0.0',
      });

      // Round 1: p1=captain, p2=crew
      const round1 = buildRoundRecord({
        matchId: match.matchId,
        roundNumber: 1,
        mode: 'faceoff',
        players,
        rolesForRound: { [player1.playerId]: 'captain', [player2.playerId]: 'crew' },
        captainTranscript: 'Xin chào.',
        crewTranscript: 'Hello.',
        meaning,
        difficulty,
        timing,
        aggregation,
        configVersion: '1.0.0',
      });

      const match1 = addRoundToMatch(match, round1);
      expect(match1.playerScores[player1.playerId].totalScore).toBe(70);
      expect(match1.playerScores[player1.playerId].roundsAsCaptain).toBe(1);
      expect(match1.playerScores[player1.playerId].roundsAsCrew).toBe(0);

      // Round 2: roles swap → p1=crew, p2=captain
      const round2 = buildRoundRecord({
        matchId: match.matchId,
        roundNumber: 2,
        mode: 'faceoff',
        players,
        rolesForRound: { [player1.playerId]: 'crew', [player2.playerId]: 'captain' },
        captainTranscript: 'Chào.',
        crewTranscript: 'Hi.',
        meaning,
        difficulty,
        timing,
        aggregation: { ...aggregation, roundScore: 60 },
        configVersion: '1.0.0',
      });

      const match2 = addRoundToMatch(match1, round2);

      // p1's score should accumulate: 70 + 60 = 130
      expect(match2.playerScores[player1.playerId].totalScore).toBe(130);
      expect(match2.playerScores[player1.playerId].roundsPlayed).toBe(2);
      expect(match2.playerScores[player1.playerId].roundsAsCaptain).toBe(1);
      expect(match2.playerScores[player1.playerId].roundsAsCrew).toBe(1);
    });
  });

  describe('role history per round remains accurate (AC6.2)', () => {
    it('historical rounds preserve original role assignment', () => {
      const { meaning, difficulty, timing, aggregation } = makeRoundData();

      const match = createMatch({
        mode: 'faceoff',
        players,
        roleSwapPolicy: 'every_round',
        configVersion: '1.0.0',
      });

      const round1 = buildRoundRecord({
        matchId: match.matchId,
        roundNumber: 1,
        mode: 'faceoff',
        players,
        rolesForRound: { [player1.playerId]: 'captain', [player2.playerId]: 'crew' },
        captainTranscript: 'Test.',
        crewTranscript: 'Test.',
        meaning,
        difficulty,
        timing,
        aggregation,
        configVersion: '1.0.0',
      });

      const match1 = addRoundToMatch(match, round1);

      // Historical round should preserve that p1 was captain in round 1
      expect(match1.rounds[0].rolesForRound[player1.playerId]).toBe('captain');
      expect(match1.rounds[0].rolesForRound[player2.playerId]).toBe('crew');

      // But current roles should be swapped for the next round
      expect(match1.currentRoles[player1.playerId]).toBe('crew');
      expect(match1.currentRoles[player2.playerId]).toBe('captain');
    });
  });

  describe('match summary reflects total score by player identity (AC6.3)', () => {
    it('should correctly aggregate scores across multiple rounds', () => {
      const { meaning, difficulty, timing } = makeRoundData();

      const match = createMatch({
        mode: 'room',
        players,
        roleSwapPolicy: 'every_round',
        configVersion: '1.0.0',
      });

      const scores = [80, 65, 90];
      let currentMatch = match;

      for (let i = 0; i < scores.length; i++) {
        const roundNumber = i + 1;
        const roles = i % 2 === 0
          ? { [player1.playerId]: 'captain' as const, [player2.playerId]: 'crew' as const }
          : { [player1.playerId]: 'crew' as const, [player2.playerId]: 'captain' as const };

        const round = buildRoundRecord({
          matchId: match.matchId,
          roundNumber,
          mode: 'room',
          players,
          rolesForRound: roles,
          captainTranscript: 'Xin chào.',
          crewTranscript: 'Hello.',
          meaning,
          difficulty,
          timing,
          aggregation: {
            roundScore: scores[i],
            components: { meaningContribution: 45, difficultyContribution: 10, timingContribution: 15 },
            verdict: 'Test.',
            trace: { baseOhm: 10, lengthCoefficient: 1.5, timingCoefficient: 1.0, difficultyScore: 20, meaningScore: 75, formula: 'test' },
          },
          configVersion: '1.0.0',
        });

        currentMatch = addRoundToMatch(currentMatch, round);
      }

      // Both players should have total = sum of all round scores
      const expectedTotal = 80 + 65 + 90;
      expect(currentMatch.playerScores[player1.playerId].totalScore).toBe(expectedTotal);
      expect(currentMatch.playerScores[player2.playerId].totalScore).toBe(expectedTotal);
      expect(currentMatch.playerScores[player1.playerId].roundsPlayed).toBe(3);
      expect(currentMatch.playerScores[player1.playerId].averageScore).toBe(Math.round(expectedTotal / 3));
    });
  });

  describe('player identity tracking', () => {
    it('should require exactly 2 players', () => {
      expect(() =>
        createMatch({
          mode: 'faceoff',
          players: [player1],
          roleSwapPolicy: 'every_round',
          configVersion: '1.0.0',
        })
      ).toThrow('exactly 2 players');
    });
  });
});
