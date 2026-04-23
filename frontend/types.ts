export type OhmLabel = 'GREEN' | 'BLUE' | 'RED' | 'PINK';

export interface Chunk {
  text: string;
  label: OhmLabel;
  confidence: number;
  reason: string;
  startIndex?: number;
  endIndex?: number;
}

export interface AgentRequest {
  transcript: string;
  model: 'gpt' | 'gemini' | 'auto';
  reactionDelayMs: number;
  context: {
    sessionId?: string;
    userId?: string;
    language: string;
  };
  flags: {
    useMemoryAssist: boolean;
    returnDebug: boolean;
  };
}

export interface DebugInfo {
  rawChunkCount: number;
  dropReasons: string[];
  memoryHits: number;
  selfCheckPassed: boolean;
  confidenceCalibrated: boolean;
}

export interface AgentResponse {
  transcriptRaw: string;
  transcriptNormalized: string;
  chunks: Chunk[];
  formula: string;
  totalOhm: number;
  modelUsed: string;
  baseOhm: number;
  lengthBucket: 'veryShort' | 'short' | 'medium' | 'long' | 'overLong';
  lengthCoefficient: number;
  responseCoefficient: number;
  sentenceCount: number;
  wordCount: number;
  elapsedMs: number;
  filteredChunkCount: number;
  lexiconChunkCount: number;
  compositeChunkCount: number;
  debug?: DebugInfo;
}

export const OHM_WEIGHTS: Record<OhmLabel, number> = {
  GREEN: 5,
  BLUE: 7,
  RED: 9,
  PINK: 3
};

export const LABEL_COLORS: Record<OhmLabel, { bg: string, text: string, border: string }> = {
  GREEN: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  BLUE: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  RED: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  PINK: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' }
};