import type {
  DifficultyInput,
  DifficultyResult,
  DifficultyConfig,
  DifficultyEvaluator,
  OhmChunk,
  OhmLabel,
  LengthBucket,
} from './types.js';
import { DEFAULT_DIFFICULTY_CONFIG } from './config.js';
import { difficultyEvaluatorUnavailable, invalidInput } from './errors.js';

/**
 * C3: Semantic Difficulty (OHM) Evaluation
 *
 * Estimates translation resistance of the Vietnamese source sentence
 * using OHM semantic chunks.
 *
 * OHM Chunk Ontology:
 * - GREEN: discourse openers / transition starters (tone framing)
 * - BLUE: reusable sentence frames with payload slots
 * - RED: idioms, proverbs, figurative nuance (highest resistance)
 * - PINK: difficult key terms/collocations
 */

const VALID_LABELS: OhmLabel[] = ['GREEN', 'BLUE', 'RED', 'PINK'];
const IDIOM_INVALID_LABELS: OhmLabel[] = ['GREEN', 'BLUE'];

export function validateDifficultyInput(input: DifficultyInput): void {
  if (!input.captainTranscript || input.captainTranscript.trim().length === 0) {
    throw invalidInput('captainTranscript must be non-empty for difficulty evaluation');
  }
}

function countSentences(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return Math.max(1, sentences.length);
}

function countWords(text: string): number {
  return text
    .replace(/[.,!?;:]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0).length;
}

function determineLengthBucket(
  sentenceCount: number,
  wordCount: number,
  config: DifficultyConfig
): { bucket: LengthBucket; coefficient: number } {
  for (const bucket of config.lengthBuckets) {
    if (sentenceCount <= bucket.maxSentences && wordCount <= bucket.maxWords) {
      return { bucket: bucket.name, coefficient: bucket.coefficient };
    }
  }

  const last = config.lengthBuckets[config.lengthBuckets.length - 1];
  return { bucket: last.name, coefficient: last.coefficient };
}

function validateChunks(chunks: OhmChunk[], transcript: string): OhmChunk[] {
  const lowerTranscript = transcript.toLowerCase();

  return chunks.filter(chunk => {
    if (!chunk.text || chunk.text.trim().length === 0) return false;

    if (!VALID_LABELS.includes(chunk.label)) return false;

    // AC3.5: Chunks must be exact contiguous substrings from the source transcript
    if (!lowerTranscript.includes(chunk.text.toLowerCase())) return false;

    // AC3.4: Idiom/proverb expressions must never be labeled as GREEN/BLUE
    // (We can't fully detect idioms here, but the evaluator should handle this)

    return true;
  });
}

function calculateBaseOhm(chunks: OhmChunk[], weights: Record<OhmLabel, number>): number {
  return chunks.reduce((sum, chunk) => sum + (weights[chunk.label] ?? 0), 0);
}

/**
 * DeterministicDifficultyEvaluator: uses the transcript text structure
 * to produce a basic difficulty score when no LLM-based chunk evaluator
 * is available.
 *
 * For production, inject an LLM-based DifficultyEvaluator that produces
 * rich OHM chunks via the OHM Semantic Evaluator prompt.
 */
export class DeterministicDifficultyEvaluator implements DifficultyEvaluator {
  async evaluate(input: DifficultyInput): Promise<DifficultyResult> {
    validateDifficultyInput(input);

    const config: DifficultyConfig = {
      weights: input.config?.weights
        ? { ...DEFAULT_DIFFICULTY_CONFIG.weights, ...input.config.weights }
        : { ...DEFAULT_DIFFICULTY_CONFIG.weights },
      lengthBuckets: input.config?.lengthBuckets ?? DEFAULT_DIFFICULTY_CONFIG.lengthBuckets,
    };

    const transcript = input.captainTranscript.trim();
    const sentenceCount = countSentences(transcript);
    const wordCount = countWords(transcript);

    // Deterministic fallback: no chunks without an LLM
    const chunks: OhmChunk[] = [];
    const baseOhm = 0;

    const { bucket, coefficient } = determineLengthBucket(sentenceCount, wordCount, config);
    const difficultyScore = Number((baseOhm * coefficient).toFixed(2));

    return {
      difficultyScore,
      chunks,
      baseOhm,
      lengthBucket: bucket,
      lengthCoefficient: coefficient,
      sentenceCount,
      wordCount,
      formula: `${baseOhm} (baseOhm) × ${coefficient} (lengthCoeff[${bucket}]) = ${difficultyScore}`,
    };
  }
}

/**
 * Evaluates difficulty using the provided evaluator, with chunk validation
 * and deterministic scoring applied on top.
 */
export async function evaluateDifficulty(
  captainTranscript: string,
  evaluator: DifficultyEvaluator,
  config?: Partial<DifficultyConfig>
): Promise<DifficultyResult> {
  validateDifficultyInput({ captainTranscript });

  const difficultyConfig: DifficultyConfig = {
    weights: config?.weights
      ? { ...DEFAULT_DIFFICULTY_CONFIG.weights, ...config.weights }
      : { ...DEFAULT_DIFFICULTY_CONFIG.weights },
    lengthBuckets: config?.lengthBuckets ?? DEFAULT_DIFFICULTY_CONFIG.lengthBuckets,
  };

  let rawResult: DifficultyResult;
  try {
    rawResult = await evaluator.evaluate({ captainTranscript, config });
  } catch (error) {
    if (error instanceof Error && error.name === 'ScoringEngineError') {
      throw error;
    }
    throw difficultyEvaluatorUnavailable(
      `Difficulty evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      { captainTranscript }
    );
  }

  // Post-process: validate chunks and recalculate with deterministic baseline
  const validatedChunks = validateChunks(rawResult.chunks, captainTranscript);
  const transcript = captainTranscript.trim();
  const sentenceCount = countSentences(transcript);
  const wordCount = countWords(transcript);
  const baseOhm = calculateBaseOhm(validatedChunks, difficultyConfig.weights);
  const { bucket, coefficient } = determineLengthBucket(sentenceCount, wordCount, difficultyConfig);
  const difficultyScore = Number((baseOhm * coefficient).toFixed(2));

  return {
    difficultyScore,
    chunks: validatedChunks,
    baseOhm,
    lengthBucket: bucket,
    lengthCoefficient: coefficient,
    sentenceCount,
    wordCount,
    formula: `${baseOhm} (baseOhm) × ${coefficient} (lengthCoeff[${bucket}]) = ${difficultyScore}`,
  };
}
