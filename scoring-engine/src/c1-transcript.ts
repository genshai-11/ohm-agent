import type { TranscriptInput, TranscriptResult, TranscriptProvider } from './types.js';
import { transcriptUnavailable, invalidInput } from './errors.js';

/**
 * C1: Transcript Capture
 *
 * Converts spoken input into text for both players with explicit language roles.
 * - Captain audio → Vietnamese transcript
 * - Crew audio → English transcript
 *
 * This module provides the interface and a pass-through implementation for
 * pre-transcribed text. Real STT integration is injected via TranscriptProvider.
 */

export function validateTranscriptInput(input: TranscriptInput): void {
  if (!input.role || (input.role !== 'captain' && input.role !== 'crew')) {
    throw invalidInput('role must be "captain" or "crew"');
  }

  if (input.role === 'captain' && input.language !== 'vi') {
    throw invalidInput('Captain role requires language "vi" (Vietnamese)');
  }

  if (input.role === 'crew' && input.language !== 'en') {
    throw invalidInput('Crew role requires language "en" (English)');
  }
}

/**
 * PassThroughTranscriptProvider: accepts pre-transcribed text as the audio payload.
 * Used when transcripts are already available (e.g., from external STT service).
 */
export class PassThroughTranscriptProvider implements TranscriptProvider {
  async transcribe(input: TranscriptInput): Promise<TranscriptResult> {
    validateTranscriptInput(input);

    const text = typeof input.audioPayload === 'string'
      ? input.audioPayload
      : new TextDecoder().decode(input.audioPayload);

    if (!text || text.trim().length === 0) {
      throw transcriptUnavailable(
        `Empty transcript for ${input.role} (${input.language})`,
        { role: input.role, language: input.language }
      );
    }

    return {
      text: text.trim(),
      confidence: 1.0,
      role: input.role,
      language: input.language,
      providerMetadata: { provider: 'pass_through' },
    };
  }
}

/**
 * Captures transcripts for both captain and crew, returning validated results.
 */
export async function captureTranscripts(
  captainPayload: string,
  crewPayload: string,
  provider: TranscriptProvider
): Promise<{ captain: TranscriptResult; crew: TranscriptResult }> {
  const captainInput: TranscriptInput = {
    audioPayload: captainPayload,
    role: 'captain',
    language: 'vi',
  };

  const crewInput: TranscriptInput = {
    audioPayload: crewPayload,
    role: 'crew',
    language: 'en',
  };

  let captain: TranscriptResult;
  try {
    captain = await provider.transcribe(captainInput);
  } catch (error) {
    throw transcriptUnavailable(
      `Captain transcript capture failed: ${error instanceof Error ? error.message : String(error)}`,
      { role: 'captain', language: 'vi' }
    );
  }

  let crew: TranscriptResult;
  try {
    crew = await provider.transcribe(crewInput);
  } catch (error) {
    throw transcriptUnavailable(
      `Crew transcript capture failed: ${error instanceof Error ? error.message : String(error)}`,
      { role: 'crew', language: 'en' }
    );
  }

  return { captain, crew };
}
