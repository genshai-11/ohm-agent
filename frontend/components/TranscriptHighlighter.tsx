import React from 'react';
import { Chunk, LABEL_COLORS } from '../types.ts';

interface TranscriptHighlighterProps {
  transcript: string;
  chunks: Chunk[];
}

export const TranscriptHighlighter: React.FC<TranscriptHighlighterProps> = ({ transcript, chunks }) => {
  if (!chunks || chunks.length === 0) {
    return <p className="text-slate-700 leading-relaxed">{transcript}</p>;
  }

  // Sort chunks by start index to process them in order
  const sortedChunks = [...chunks]
    .filter(c => c.startIndex !== undefined && c.endIndex !== undefined)
    .sort((a, b) => (a.startIndex || 0) - (b.startIndex || 0));

  const elements: React.ReactNode[] = [];
  let currentIndex = 0;

  sortedChunks.forEach((chunk, idx) => {
    const start = chunk.startIndex!;
    const end = chunk.endIndex!;

    // If there's overlap, skip for simplicity in this demo, 
    // or just render text up to the start of this chunk
    if (start < currentIndex) return;

    // Add unhighlighted text before the chunk
    if (start > currentIndex) {
      elements.push(
        <span key={`text-${idx}`}>
          {transcript.substring(currentIndex, start)}
        </span>
      );
    }

    // Add the highlighted chunk
    const colors = LABEL_COLORS[chunk.label] || { bg: 'bg-gray-200', text: 'text-gray-800', border: 'border-gray-300' };
    elements.push(
      <span 
        key={`chunk-${idx}`} 
        className={`${colors.bg} ${colors.text} border ${colors.border} px-1 rounded font-medium relative group cursor-help transition-colors`}
        title={`${chunk.label} (${Math.round(chunk.confidence * 100)}%): ${chunk.reason}`}
      >
        {transcript.substring(start, end)}
        
        {/* Tooltip */}
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-slate-800 text-white text-xs rounded shadow-lg z-10">
          <strong className="block mb-1">{chunk.label}</strong>
          {chunk.reason}
        </span>
      </span>
    );

    currentIndex = end;
  });

  // Add remaining text
  if (currentIndex < transcript.length) {
    elements.push(
      <span key="text-end">
        {transcript.substring(currentIndex)}
      </span>
    );
  }

  return (
    <div className="text-slate-700 leading-loose text-lg">
      {elements}
    </div>
  );
};