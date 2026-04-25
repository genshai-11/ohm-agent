# Captain & Crew — Failure-Mode Behavior Matrix

## Error Categories

| Category                          | Trigger Condition                            | Behavior                                        | Partial Diagnostics |
|-----------------------------------|----------------------------------------------|-------------------------------------------------|---------------------|
| `transcript_unavailable`          | STT service unreachable, empty audio payload | Returns error with role/language context         | Yes – role, language |
| `meaning_evaluator_unavailable`   | LLM API unreachable or throws                | Returns error, preserves transcript data         | Yes – transcripts    |
| `difficulty_evaluator_unavailable`| OHM chunk evaluator fails                    | Returns error, preserves partial state           | Yes – transcript     |
| `timeout`                         | Crew response exceeds `timeoutMs` threshold  | Explicit timeout flag, score = 0                 | Yes – delay value    |
| `persistence_failure`             | Store write fails after scoring              | Returns error with all computed scores           | Yes – full results   |
| `invalid_input`                   | Invalid config, missing match, wrong players | Returns error with validation details            | Yes – field info     |
| `config_validation_error`         | Config fails validation rules                | Throws at engine construction, readable message  | Yes – error list     |

## Failure Handling Principles

1. **Fail with typed error category**: Every error carries a `ScoringErrorCategory` that uniquely identifies the failure type.

2. **Preserve partial diagnostics**: When a failure occurs mid-pipeline, all successfully computed partial results are returned in `partialDiagnostics`.

3. **No silent fallback**: The system never silently falls back to a default score or ignores an error. Every failure produces an explicit error response.

4. **Atomic round writes**: Round records are never partially persisted. Either the full record is saved or nothing is saved.

## Error Response Shape

```typescript
{
  success: false;
  error: {
    category: ScoringErrorCategory;
    message: string;
    diagnostics?: Record<string, unknown>;
  };
  partialDiagnostics?: Record<string, unknown>;
}
```

## Per-Capability Failure Behavior

### C1: Transcript Capture
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Empty captain audio         | `transcript_unavailable` error              |
| Empty crew audio            | `transcript_unavailable` error              |
| Wrong language for role     | `invalid_input` error                       |
| STT service down            | `transcript_unavailable` error              |

### C2: Meaning Match Evaluation
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Empty crew transcript       | Returns `mismatch` decision, score = 0      |
| LLM API failure             | `meaning_evaluator_unavailable` error       |
| Invalid strictness profile  | `invalid_input` error                       |

### C3: Difficulty Evaluation
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Empty captain transcript    | `invalid_input` error                       |
| LLM chunk evaluator failure | `difficulty_evaluator_unavailable` error    |
| Invalid chunk labels        | Chunks filtered out, recalculated           |
| Non-substring chunks        | Chunks filtered out, recalculated           |

### C4: Timing Evaluation
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Non-finite timestamps       | `invalid_input` error                       |
| Negative delay (crew early) | Delay clamped to 0, coefficient = 1.0       |
| Delay exceeds timeout       | `isTimeout = true`, coefficient = min       |

### C5: Aggregation
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Missing meaning result      | `invalid_input` error                       |
| Missing difficulty result   | `invalid_input` error                       |
| Missing timing result       | `invalid_input` error                       |
| Timeout decision            | Score forced to 0                           |

### C6: Persistence
| Scenario                    | Result                                      |
|-----------------------------|---------------------------------------------|
| Non-existent match          | `invalid_input` error                       |
| Wrong round number          | `invalid_input` error                       |
| Store write failure         | `persistence_failure` error                 |
| Wrong number of players     | `invalid_input` error                       |
