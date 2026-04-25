import type { ScoringError, ScoringErrorCategory } from './types.js';

export class ScoringEngineError extends Error {
  public readonly category: ScoringErrorCategory;
  public readonly diagnostics: Record<string, unknown>;

  constructor(category: ScoringErrorCategory, message: string, diagnostics?: Record<string, unknown>) {
    super(message);
    this.name = 'ScoringEngineError';
    this.category = category;
    this.diagnostics = diagnostics ?? {};
  }

  toScoringError(): ScoringError {
    return {
      category: this.category,
      message: this.message,
      diagnostics: Object.keys(this.diagnostics).length > 0 ? this.diagnostics : undefined,
    };
  }
}

export function transcriptUnavailable(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('transcript_unavailable', message, diagnostics);
}

export function meaningEvaluatorUnavailable(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('meaning_evaluator_unavailable', message, diagnostics);
}

export function difficultyEvaluatorUnavailable(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('difficulty_evaluator_unavailable', message, diagnostics);
}

export function timeoutError(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('timeout', message, diagnostics);
}

export function persistenceFailure(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('persistence_failure', message, diagnostics);
}

export function invalidInput(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('invalid_input', message, diagnostics);
}

export function configValidationError(message: string, diagnostics?: Record<string, unknown>): ScoringEngineError {
  return new ScoringEngineError('config_validation_error', message, diagnostics);
}
