# Captain & Crew Scoring Engine

Reusable scoring engine for the **Chunks** product, project **Captain & Crew**.

## Core Gameplay Loop

1. **Captain** speaks in **Vietnamese** (source meaning)
2. **Crew** captures the idea and responds in **English** (meaning transfer)
3. System scores round performance using:
   - Meaning accuracy (Vietnamese source → English response)
   - Semantic difficulty (OHM resistance)
   - Response timing

Works identically in both **Faceoff** (same-device) and **Room** (multi-device) modes.

## Quick Start

```typescript
import { ScoringEngine } from './src/index.js';

const engine = new ScoringEngine();

// Create a match
const match = await engine.createMatch('faceoff', [
  { playerId: 'alice', displayName: 'Alice' },
  { playerId: 'bob', displayName: 'Bob' },
]);

// Score a round
const result = await engine.scoreRound({
  matchId: match.matchId,
  mode: 'faceoff',
  captainPlayerId: 'alice',
  crewPlayerId: 'bob',
  captainTranscript: 'Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi.',
  crewTranscript: 'From now on, remember that sweet words can kill.',
  captainStopTimestamp: 1000,
  crewStartTimestamp: 2500,
});

if (result.success) {
  console.log(`Round score: ${result.round.roundScore}`);
  console.log(`Verdict: ${result.round.verdict}`);
}
```

## Architecture

| Module | Capability | Description |
|--------|-----------|-------------|
| `c1-transcript.ts` | C1 | Transcript capture with language role validation |
| `c2-meaning.ts` | C2 | Cross-language meaning match evaluation |
| `c3-difficulty.ts` | C3 | OHM semantic difficulty scoring |
| `c4-timing.ts` | C4 | Response timing with linear decay |
| `c5-aggregation.ts` | C5 | Weighted score aggregation with meaning-first rule |
| `c6-persistence.ts` | C6 | Round persistence, match tracking, role swap |
| `config.ts` | C7 | Global configuration with validation |
| `errors.ts` | C8 | Typed error categories |

## Dependency Injection

The engine accepts injectable providers for production use:

```typescript
const engine = new ScoringEngine({
  meaningEvaluator: new LLMBasedMeaningEvaluator(geminiClient),
  difficultyEvaluator: new LLMBasedDifficultyEvaluator(geminiClient),
  transcriptProvider: new GoogleSTTProvider(sttClient),
  roundStore: new FirestoreRoundStore(db),
  matchStore: new FirestoreMatchStore(db),
});
```

## Running Tests

```bash
npm install
npm test
```

## Documentation

- [Scoring Formula](docs/scoring-formula.md)
- [Round Record Schema](docs/schema.md)
- [Failure-Mode Matrix](docs/failure-matrix.md)
