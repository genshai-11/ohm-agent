import { GoogleGenAI, Type } from '@google/genai';
import { AgentRequest, AgentResponse, Chunk, OHM_WEIGHTS } from '../types.ts';
import { SYSTEM_PROMPT } from '../constants.ts';
import { KNOWN_PHRASES } from '../database.ts';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY, vertexai: true });

function calculateResponseCoefficient(delayMs: number): number {
  if (delayMs <= 2000) return 1.0;
  if (delayMs >= 5000) return 1 / 3;
  
  const decayRange = 5000 - 2000;
  const valueRange = 1.0 - (1 / 3);
  const progress = (delayMs - 2000) / decayRange;
  
  return 1.0 - (progress * valueRange);
}

function calculateLengthMetrics(wordCount: number, sentenceCount: number): { bucket: AgentResponse['lengthBucket'], coeff: number } {
  if (sentenceCount <= 1 && wordCount <= 25) return { bucket: 'veryShort', coeff: 1.0 };
  if (sentenceCount <= 2 && wordCount <= 35) return { bucket: 'short', coeff: 1.5 };
  if (sentenceCount <= 3 && wordCount <= 60) return { bucket: 'medium', coeff: 2.0 };
  if (sentenceCount <= 5 && wordCount <= 110) return { bucket: 'long', coeff: 2.5 };
  return { bucket: 'overLong', coeff: 2.5 };
}

export async function evaluateTranscript(request: AgentRequest): Promise<AgentResponse> {
  const startTime = performance.now();
  
  // 1. Retrieve Memory (RAG Approach)
  const lowerTranscript = request.transcript.toLowerCase();
  const memoryHints = KNOWN_PHRASES.filter(phrase => 
    lowerTranscript.includes(phrase.text.toLowerCase())
  );

  let promptContents = `Transcript to analyze: "${request.transcript}"`;
  
  if (request.flags.useMemoryAssist && memoryHints.length > 0) {
    promptContents += `\n\n[Memory Assist] Potential matches found in validated database:\n`;
    memoryHints.forEach(hint => {
      promptContents += `- "${hint.text}" (Suggested Label: ${hint.label})\n`;
    });
    promptContents += `\nNote: Use these hints as strong priors, but verify contextually. Ignore false positive substrings.`;
  }

  // 2. Call Gemini (Detect -> Reason/Rerank)
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      role: 'user',
      parts: [
        {
          text: promptContents,
        }
      ]
    },
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "The exact substring extracted" },
            label: { type: Type.STRING, description: "GREEN, BLUE, RED, or PINK" },
            confidence: { type: Type.NUMBER, description: "0.0 to 1.0" },
            reason: { type: Type.STRING, description: "Explanation for the label" }
          },
          propertyOrdering: ["text", "label", "confidence", "reason"]
        }
      }
    }
  });

  const endTime = performance.now();
  const elapsedMs = Math.round(endTime - startTime);

  let rawChunks: Chunk[] = [];
  try {
    rawChunks = JSON.parse(response.text.trim());
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    rawChunks = [];
  }

  // 3. Self-Check & Filtering
  const normalizedTranscript = request.transcript.toLowerCase().replace(/[.,!?]/g, '');
  const words = normalizedTranscript.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const sentenceCount = request.transcript.split(/[.!?]+/).filter(s => s.trim().length > 0).length || 1;

  const dropReasons: string[] = [];
  const validChunks = rawChunks.filter(chunk => {
    if (!request.transcript.toLowerCase().includes(chunk.text.toLowerCase())) {
      dropReasons.push(`Rejected '${chunk.text}': Not an exact substring.`);
      return false;
    }
    if (!['GREEN', 'BLUE', 'RED', 'PINK'].includes(chunk.label)) {
      dropReasons.push(`Rejected '${chunk.text}': Invalid label ${chunk.label}.`);
      return false;
    }
    return true;
  });

  // FIX: Corrected the startIndex logic bug here
  const chunksWithIndices = validChunks.map(chunk => {
    const lowerText = chunk.text.toLowerCase();
    const startIndex = lowerTranscript.indexOf(lowerText);
    return {
      ...chunk,
      startIndex: startIndex,
      endIndex: startIndex !== -1 ? startIndex + chunk.text.length : -1
    };
  }).filter(c => c.startIndex !== -1);

  // --- NEW RULE: Limit PINK chunks per sentence ---
  // 3.1 Detect sentence boundaries
  const sentenceRegex = /[^.!?]+[.!?]*/g;
  let match;
  const sentences: {start: number, end: number}[] = [];
  while ((match = sentenceRegex.exec(request.transcript)) !== null) {
    sentences.push({ start: match.index, end: match.index + match[0].length });
  }
  if (sentences.length === 0) {
    sentences.push({ start: 0, end: request.transcript.length });
  }

  const finalChunks: typeof chunksWithIndices = [];
  const pinkChunksBySentence = new Map<number, typeof chunksWithIndices>();

  // 3.2 Group PINK chunks by sentence
  chunksWithIndices.forEach(chunk => {
    if (chunk.label !== 'PINK') {
      finalChunks.push(chunk);
    } else {
      let sIdx = sentences.findIndex(s => chunk.startIndex >= s.start && chunk.startIndex < s.end);
      if (sIdx === -1) sIdx = 0; // Fallback
      if (!pinkChunksBySentence.has(sIdx)) pinkChunksBySentence.set(sIdx, []);
      pinkChunksBySentence.get(sIdx)!.push(chunk);
    }
  });

  const isMatchedInDb = (text: string) => KNOWN_PHRASES.some(p => p.text.toLowerCase() === text.toLowerCase() && p.label === 'PINK');

  // 3.3 Apply filtering logic per sentence
  pinkChunksBySentence.forEach((pinkChunks, sIdx) => {
    if (pinkChunks.length <= 2) {
      finalChunks.push(...pinkChunks);
    } else {
      // Sort: Matched DB first, then Confidence desc
      pinkChunks.sort((a, b) => {
        const aMatch = isMatchedInDb(a.text) ? 1 : 0;
        const bMatch = isMatchedInDb(b.text) ? 1 : 0;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return b.confidence - a.confidence;
      });

      // Always keep top 2
      finalChunks.push(pinkChunks[0]);
      finalChunks.push(pinkChunks[1]);

      // Check 3rd chunk
      if (pinkChunks.length > 2) {
        if (pinkChunks[2].confidence > 0.90) {
          finalChunks.push(pinkChunks[2]);
        } else {
          dropReasons.push(`Rejected PINK chunk '${pinkChunks[2].text}': Exceeded max PINK per sentence (confidence ${pinkChunks[2].confidence} <= 0.90).`);
        }
      }

      // Drop 4th and beyond
      for (let i = 3; i < pinkChunks.length; i++) {
        dropReasons.push(`Rejected PINK chunk '${pinkChunks[i].text}': Exceeded max PINK per sentence limit.`);
      }
    }
  });

  // Re-sort final chunks by start index to maintain order
  finalChunks.sort((a, b) => a.startIndex - b.startIndex);

  // 4. Scoring Policy
  let baseOhm = 0;
  finalChunks.forEach(chunk => {
    baseOhm += OHM_WEIGHTS[chunk.label as keyof typeof OHM_WEIGHTS] || 0;
  });

  const { bucket: lengthBucket, coeff: lengthCoefficient } = calculateLengthMetrics(wordCount, sentenceCount);
  const effectiveDelay = request.reactionDelayMs > 0 ? request.reactionDelayMs : elapsedMs;
  const responseCoefficient = calculateResponseCoefficient(effectiveDelay);

  const totalOhm = Number((baseOhm * lengthCoefficient * responseCoefficient).toFixed(2));
  const formula = `${baseOhm} (Base) x ${lengthCoefficient} (Len) x ${responseCoefficient.toFixed(2)} (Resp)`;

  return {
    transcriptRaw: request.transcript,
    transcriptNormalized: normalizedTranscript,
    chunks: finalChunks.map(c => ({
      text: c.text,
      label: c.label,
      confidence: c.confidence,
      reason: c.reason,
      startIndex: c.startIndex,
      endIndex: c.endIndex
    })),
    formula,
    totalOhm,
    modelUsed: 'gemini-2.5-flash (memory-orchestrated)',
    baseOhm,
    lengthBucket,
    lengthCoefficient,
    responseCoefficient,
    sentenceCount,
    wordCount,
    elapsedMs,
    filteredChunkCount: finalChunks.length,
    lexiconChunkCount: finalChunks.filter(c => c.label === 'PINK').length,
    compositeChunkCount: finalChunks.filter(c => c.label !== 'PINK').length,
    debug: request.flags.returnDebug ? {
      rawChunkCount: rawChunks.length,
      dropReasons,
      memoryHits: memoryHints.length,
      selfCheckPassed: dropReasons.length === 0,
      confidenceCalibrated: true
    } : undefined
  };
}
