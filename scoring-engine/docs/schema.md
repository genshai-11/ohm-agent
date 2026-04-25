# Captain & Crew — Canonical Round Record Schema

## Round Record (Required Fields)

| Field              | Type                          | Description                                    |
|--------------------|-------------------------------|------------------------------------------------|
| `roundId`          | `string` (UUID)               | Unique identifier for the round                |
| `matchId`          | `string` (UUID)               | Match this round belongs to                    |
| `roundNumber`      | `number`                      | Sequential round number (1-based)              |
| `mode`             | `"faceoff" \| "room"`         | Game mode                                      |
| `players`          | `PlayerIdentity[]`            | Player identities (2 players)                  |
| `rolesForRound`    | `Record<string, PlayerRole>`  | Who was captain/crew this round                |
| `captainTranscript`| `string`                      | Vietnamese transcript from Captain             |
| `crewTranscript`   | `string`                      | English transcript from Crew                   |
| `meaningScore`     | `number` (0–100)              | Semantic equivalence score                     |
| `decision`         | `MeaningDecision`             | `"match" \| "partial" \| "mismatch" \| "timeout"` |
| `difficultyScore`  | `number`                      | Translation resistance score                   |
| `chunks`           | `OhmChunk[]`                  | OHM semantic chunks extracted                  |
| `responseDelayMs`  | `number`                      | Delay in milliseconds                          |
| `timingCoefficient`| `number` (0.33–1.0)           | Reaction speed coefficient                     |
| `roundScore`       | `number` (0–100)              | Final aggregated score                         |
| `components`       | `ComponentContributions`      | Breakdown of score contributions               |
| `verdict`          | `string`                      | Human-readable verdict summary                 |
| `trace`            | `AggregationTrace`            | Full audit trace for explainability            |
| `configVersion`    | `string`                      | Config version used for this round             |
| `createdAt`        | `string` (ISO 8601)           | Timestamp of round creation                    |

## Round Record (Recommended Fields)

| Field              | Type                          | Description                                    |
|--------------------|-------------------------------|------------------------------------------------|
| `missingConcepts`  | `string[]`                    | Concepts in Captain not captured by Crew       |
| `extraConcepts`    | `string[]`                    | Extra concepts Crew added                      |
| `providerMetadata` | `Record<string, unknown>`     | Provider/model metadata                        |
| `diagnostics`      | `Record<string, unknown>`     | Debug/diagnostic information                   |

## Supporting Types

### PlayerIdentity
```typescript
{
  playerId: string;
  displayName?: string;
}
```

### OhmChunk
```typescript
{
  text: string;       // Exact contiguous substring from source transcript
  label: OhmLabel;    // "GREEN" | "BLUE" | "RED" | "PINK"
  confidence: number; // 0.0 to 1.0
  reason: string;     // Brief explanation
}
```

### AggregationTrace
```typescript
{
  baseOhm: number;
  lengthCoefficient: number;
  timingCoefficient: number;
  difficultyScore: number;
  meaningScore: number;
  formula: string;     // Human-readable formula string
}
```

### ComponentContributions
```typescript
{
  meaningContribution: number;
  difficultyContribution: number;
  timingContribution: number;
}
```

## Match State Schema

| Field              | Type                          | Description                                    |
|--------------------|-------------------------------|------------------------------------------------|
| `matchId`          | `string` (UUID)               | Unique match identifier                        |
| `mode`             | `GameMode`                    | Game mode                                      |
| `players`          | `PlayerIdentity[]`            | Both players                                   |
| `currentRound`     | `number`                      | Current round number                           |
| `roleSwapPolicy`   | `RoleSwapPolicy`              | `"every_round" \| "every_two" \| "manual"`     |
| `currentRoles`     | `Record<string, PlayerRole>`  | Current role assignments                       |
| `playerScores`     | `Record<string, PlayerScore>` | Cumulative scores per player                   |
| `rounds`           | `RoundRecord[]`               | All completed rounds                           |
| `configVersion`    | `string`                      | Config version                                 |
| `status`           | `"active" \| "completed"`     | Match status                                   |
| `createdAt`        | `string` (ISO 8601)           | Match creation time                            |
| `updatedAt`        | `string` (ISO 8601)           | Last update time                               |

## Player Score Schema

| Field              | Type                          | Description                                    |
|--------------------|-------------------------------|------------------------------------------------|
| `playerId`         | `string`                      | Stable player identity                         |
| `displayName`      | `string?`                     | Display name                                   |
| `totalScore`       | `number`                      | Cumulative score across all rounds             |
| `roundsPlayed`     | `number`                      | Total rounds played                            |
| `roundsAsCaptain`  | `number`                      | Rounds where player was captain                |
| `roundsAsCrew`     | `number`                      | Rounds where player was crew                   |
| `averageScore`     | `number`                      | Average score per round                        |
| `roundHistory`     | `RoundHistoryEntry[]`         | Per-round score + role history                 |
