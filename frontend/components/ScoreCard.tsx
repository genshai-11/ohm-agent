import React from 'react';
import { AgentResponse } from '../types.ts';
import { Calculator, Clock, Type, Zap } from 'lucide-react';

interface ScoreCardProps {
  result: AgentResponse;
}

export const ScoreCard: React.FC<ScoreCardProps> = ({ result }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="bg-slate-800 px-6 py-4 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          OHM Score Analysis
        </h3>
        <div className="text-3xl font-bold text-white">
          {result.totalOhm.toFixed(2)}
        </div>
      </div>
      
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Base Score */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-500 font-medium flex items-center gap-1">
            <Calculator className="w-4 h-4" /> Base OHM
          </span>
          <span className="text-2xl font-semibold text-slate-800">{result.baseOhm}</span>
          <span className="text-xs text-slate-400">Sum of chunk weights</span>
        </div>

        {/* Length Multiplier */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-500 font-medium flex items-center gap-1">
            <Type className="w-4 h-4" /> Length Coeff
          </span>
          <span className="text-2xl font-semibold text-slate-800">x{result.lengthCoefficient}</span>
          <span className="text-xs text-slate-400">Bucket: {result.lengthBucket} ({result.sentenceCount} sents, {result.wordCount} words)</span>
        </div>

        {/* Response Multiplier */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-slate-500 font-medium flex items-center gap-1">
            <Clock className="w-4 h-4" /> Response Coeff
          </span>
          <span className="text-2xl font-semibold text-slate-800">x{result.responseCoefficient.toFixed(2)}</span>
          <span className="text-xs text-slate-400">Based on reaction delay</span>
        </div>
      </div>

      <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 text-sm text-slate-600 font-mono">
        Formula: {result.formula} = {result.totalOhm}
      </div>
    </div>
  );
};
