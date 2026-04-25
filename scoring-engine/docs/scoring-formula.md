# Captain & Crew — Scoring Formula Document

## Overview

Each round produces a **roundScore** (0–100) composed of three weighted components plus optional bonuses.

---

## 1. Component Signals

### Meaning Score (0–100)
Cross-language semantic equivalence between Captain's Vietnamese and Crew's English.

| Decision   | Typical Range |
|------------|---------------|
| `match`    | 65–100        |
| `partial`  | 25–64         |
| `mismatch` | 0–24          |
| `timeout`  | 0             |

### Difficulty Score (raw OHM)
Translation resistance of the Vietnamese source sentence.

```
baseOhm = Σ(chunk weights)
difficultyScore = baseOhm × lengthCoefficient
```

**OHM Label Weights:**

| Label  | Weight | Description                               |
|--------|--------|-------------------------------------------|
| RED    | 9      | Idioms, proverbs, figurative nuance       |
| BLUE   | 7      | Reusable sentence frames with payload slots|
| GREEN  | 5      | Discourse openers / transition starters    |
| PINK   | 3      | Difficult key terms / collocations         |

**Length Buckets:**

| Bucket    | Max Sentences | Max Words | Coefficient |
|-----------|---------------|-----------|-------------|
| veryShort | ≤1            | ≤25       | 1.0         |
| short     | ≤2            | ≤35       | 1.5         |
| medium    | ≤3            | ≤60       | 2.0         |
| long      | ≤5            | ≤110      | 2.5         |
| overLong  | >5            | >110      | 2.5         |

### Timing Coefficient (0.33–1.0)
Reaction speed from Captain completion to Crew response start.

```
delay ≤ 2000ms  → coefficient = 1.0
delay ≥ 5000ms  → coefficient = 0.33
2000 < delay < 5000 → linear decay
delay ≥ 30000ms → timeout (coefficient = 0.33, decision overridden)
```

---

## 2. Aggregation Formula

### Default Weight Profile
| Component  | Weight |
|------------|--------|
| Meaning    | 0.60   |
| Difficulty | 0.25   |
| Timing     | 0.15   |

### Formula
```
meaningContribution   = meaningScore × meaningWeight
difficultyContribution = normalize(difficultyScore) × difficultyWeight
timingContribution     = (timingCoefficient × 100) × timingWeight

rawScore = meaningContribution + difficultyContribution + timingContribution + difficultyBonus

roundScore = clamp(applyMeaningFirstRule(rawScore, meaningScore), 0, 100)
```

### Difficulty Bonus
When meaning is preserved (>50) and difficulty is high (>10):
```
bonus = meaningFactor × difficultyFactor × 15
  where meaningFactor = (meaningScore - 50) / 50
        difficultyFactor = min(1, normalizedDifficulty / 80)
```

### Meaning-First Rule
- If meaningScore < 20: `roundScore = min(rawScore, meaningScore)`
- If meaningScore < 40: penalty applied proportional to gap from 40
- If decision = timeout: `roundScore = 0`

---

## 3. Worked Example

**Input:**
- Captain says (Vietnamese): "Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi."
- Crew responds (English): "From now on, remember that sweet words can kill."
- Delay: 1500ms

**Component Scores:**
- meaningScore = 78 (match)
- chunks: GREEN(5) + BLUE(7) + RED(9) = baseOhm 21
- lengthBucket: short (1.5) → difficultyScore = 31.5
- timingCoefficient = 1.0 (under 2000ms)

**Aggregation:**
```
meaning:    78 × 0.60 = 46.8 → 47
difficulty: 31.5 normalized to 31.5, × 0.25 = 7.875 → 8
timing:     100 × 0.15 = 15
difficultyBonus: (78-50)/50 × min(1, 31.5/80) × 15 ≈ 3

rawScore = 47 + 8 + 15 + 3 = 73
roundScore = 73 ✓ (no meaning-first cap needed)
```
