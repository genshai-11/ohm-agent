import type { MeaningInput, MeaningResult, MeaningEvaluator, StrictnessProfile } from './types.js';
import { meaningEvaluatorUnavailable, invalidInput } from './errors.js';

/**
 * C2: Meaning Match Evaluation
 *
 * Scores cross-language semantic equivalence between Captain Vietnamese
 * transcript and Crew English transcript.
 */

export function validateMeaningInput(input: MeaningInput): void {
  if (!input.captainTranscript || input.captainTranscript.trim().length === 0) {
    throw invalidInput('captainTranscript must be non-empty');
  }
  if (!input.crewTranscript || input.crewTranscript.trim().length === 0) {
    throw invalidInput('crewTranscript must be non-empty for meaning evaluation');
  }
  const validStrictness: StrictnessProfile[] = ['loose', 'medium', 'strict'];
  if (!validStrictness.includes(input.strictness)) {
    throw invalidInput(`strictness must be one of: ${validStrictness.join(', ')}`);
  }
}

function emptyMeaningResult(decision: 'mismatch' | 'timeout', reason: string): MeaningResult {
  return {
    meaningScore: 0,
    decision,
    reason,
    missingConcepts: [],
    extraConcepts: [],
  };
}

/**
 * DeterministicMeaningEvaluator: a rule-based fallback evaluator
 * that uses basic heuristics for scoring when no LLM provider is available.
 *
 * For production use, inject an LLM-based MeaningEvaluator that calls
 * an external API (e.g., Gemini, GPT) for cross-language semantic evaluation.
 */
export class DeterministicMeaningEvaluator implements MeaningEvaluator {
  async evaluate(input: MeaningInput): Promise<MeaningResult> {
    validateMeaningInput(input);

    const captainText = input.captainTranscript.trim();
    const crewText = input.crewTranscript.trim();

    if (crewText.length === 0) {
      return emptyMeaningResult('mismatch', 'Empty crew response');
    }

    const captainWords = this.tokenize(captainText);
    const crewWords = this.tokenize(crewText);

    if (crewWords.length === 0) {
      return emptyMeaningResult('mismatch', 'Crew response contains no meaningful words');
    }

    const lengthRatio = crewWords.length / Math.max(captainWords.length, 1);
    const lengthScore = this.scoreLengthRatio(lengthRatio);

    const crewWordCount = crewWords.length;
    const contentScore = Math.min(100, Math.round(
      (crewWordCount >= 3 ? 50 : crewWordCount * 15) + lengthScore * 50
    ));

    const thresholds = this.getThresholds(input.strictness);
    const meaningScore = Math.max(0, Math.min(100, contentScore));

    let decision: MeaningResult['decision'];
    if (meaningScore >= thresholds.matchThreshold) {
      decision = 'match';
    } else if (meaningScore >= thresholds.partialThreshold) {
      decision = 'partial';
    } else {
      decision = 'mismatch';
    }

    const reason = this.buildReason(meaningScore, decision, lengthRatio);

    return {
      meaningScore,
      decision,
      reason,
      missingConcepts: [],
      extraConcepts: [],
    };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  }

  private scoreLengthRatio(ratio: number): number {
    if (ratio >= 0.3 && ratio <= 2.0) return 1.0;
    if (ratio < 0.3) return ratio / 0.3;
    return Math.max(0, 1.0 - (ratio - 2.0) / 3.0);
  }

  private getThresholds(strictness: StrictnessProfile) {
    switch (strictness) {
      case 'loose': return { matchThreshold: 50, partialThreshold: 25 };
      case 'medium': return { matchThreshold: 65, partialThreshold: 35 };
      case 'strict': return { matchThreshold: 80, partialThreshold: 50 };
    }
  }

  private buildReason(score: number, decision: string, lengthRatio: number): string {
    const parts: string[] = [];

    if (decision === 'match') {
      parts.push('Crew response adequately captures the captain\'s intent.');
    } else if (decision === 'partial') {
      parts.push('Crew response partially captures the captain\'s intent.');
    } else {
      parts.push('Crew response does not adequately capture the captain\'s intent.');
    }

    if (lengthRatio < 0.3) {
      parts.push('Response is significantly shorter than expected.');
    } else if (lengthRatio > 2.0) {
      parts.push('Response is significantly longer than expected.');
    }

    return parts.join(' ');
  }
}

/**
 * Evaluates meaning match using the provided evaluator.
 * Falls back to a safe error result if the evaluator throws.
 */
export async function evaluateMeaning(
  captainTranscript: string,
  crewTranscript: string,
  strictness: StrictnessProfile,
  evaluator: MeaningEvaluator
): Promise<MeaningResult> {
  if (!crewTranscript || crewTranscript.trim().length === 0) {
    return emptyMeaningResult('mismatch', 'Empty or invalid crew response');
  }

  const input: MeaningInput = { captainTranscript, crewTranscript, strictness };

  try {
    const result = await evaluator.evaluate(input);

    return {
      meaningScore: Math.max(0, Math.min(100, Math.round(result.meaningScore))),
      decision: result.decision,
      reason: result.reason || 'No reason provided',
      missingConcepts: result.missingConcepts ?? [],
      extraConcepts: result.extraConcepts ?? [],
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'ScoringEngineError') {
      throw error;
    }
    throw meaningEvaluatorUnavailable(
      `Meaning evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      { captainTranscript, crewTranscript, strictness }
    );
  }
}
