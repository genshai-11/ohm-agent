import React, { useEffect, useState } from 'react';
import { Chunk, ChunkFeedbackItem, OhmLabel, LABEL_COLORS } from '../types.ts';
import { Check, X, Plus, Save, MessageSquareWarning } from 'lucide-react';
import { submitFeedback } from '../services/memoryService.ts';

interface FeedbackPanelProps {
  transcript: string;
  chunks: Chunk[];
  sessionId: string;
}

export const FeedbackPanel: React.FC<FeedbackPanelProps> = ({ transcript, chunks, sessionId }) => {
  const [feedbackState, setFeedbackState] = useState<Record<number, 'accept' | 'reject' | null>>({});
  const [newChunks, setNewChunks] = useState<{ text: string; label: OhmLabel }[]>([]);
  const [newText, setNewText] = useState('');
  const [newLabel, setNewLabel] = useState<OhmLabel>('GREEN');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setFeedbackState({});
  }, [chunks]);

  const handleFeedback = (index: number, status: 'accept' | 'reject') => {
    setFeedbackState(prev => ({ ...prev, [index]: status }));
  };

  const handleAddNewChunk = () => {
    if (!newText.trim()) return;
    // Basic validation: check if it's a substring
    if (!transcript.toLowerCase().includes(newText.toLowerCase().trim())) {
      alert("Cụm từ thêm mới phải nằm chính xác trong câu gốc (Exact substring).");
      return;
    }
    setNewChunks(prev => [...prev, { text: newText.trim(), label: newLabel }]);
    setNewText('');
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setIsSaving(true);

    try {
      const chunkFeedback: ChunkFeedbackItem[] = Object.entries(feedbackState)
        .filter(([, status]) => status === 'accept' || status === 'reject')
        .map(([index, status]) => {
          const chunk = chunks[Number(index)];
          if (!chunk) return null;
          return {
            text: chunk.text,
            label: chunk.label,
            status: status as 'accept' | 'reject',
            confidence: chunk.confidence
          };
        })
        .filter((item): item is ChunkFeedbackItem => item !== null);

      await submitFeedback({
        sessionId,
        transcript,
        chunkFeedback,
        newChunks
      });

      setIsSubmitted(true);
      setTimeout(() => setIsSubmitted(false), 3000);
    } catch (error: any) {
      console.error('Failed to submit feedback', error);
      setSubmitError(error?.message || 'Failed to submit feedback');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
      <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="text-md font-semibold text-slate-800 flex items-center gap-2">
          <MessageSquareWarning className="w-5 h-5 text-indigo-600" />
          Human Review Gate (Feedback & Learning)
        </h3>
      </div>
      
      <div className="p-6 space-y-6">
        <p className="text-sm text-slate-600">
          Đánh giá kết quả của Agent để hệ thống học hỏi. Các đánh giá này sẽ được lưu vào <code>ohm_feedback_events</code> và cập nhật trọng số ưu tiên trong Memory.
        </p>

        {/* Review Existing Chunks */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-700">1. Đánh giá các cụm từ AI bắt được:</h4>
          {chunks.length === 0 ? (
            <p className="text-sm text-slate-400 italic">AI không bắt được cụm từ nào.</p>
          ) : (
            <div className="space-y-2">
              {chunks.map((chunk, idx) => {
                const colors = LABEL_COLORS[chunk.label];
                const status = feedbackState[idx];
                return (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${status === 'accept' ? 'border-green-300 bg-green-50' : status === 'reject' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${colors.bg} ${colors.text}`}>
                        {chunk.label}
                      </span>
                      <span className="font-medium text-slate-800">"{chunk.text}"</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleFeedback(idx, 'accept')}
                        className={`p-1.5 rounded-md transition-colors ${status === 'accept' ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-green-100 hover:text-green-600'}`}
                        title="Chính xác (Accept)"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleFeedback(idx, 'reject')}
                        className={`p-1.5 rounded-md transition-colors ${status === 'reject' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600'}`}
                        title="Bắt sai (Reject)"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Missing Chunks */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-sm font-medium text-slate-700">2. Bổ sung cụm từ AI bỏ sót:</h4>
          
          {newChunks.length > 0 && (
            <div className="space-y-2 mb-3">
              {newChunks.map((chunk, idx) => {
                const colors = LABEL_COLORS[chunk.label];
                return (
                  <div key={`new-${idx}`} className="flex items-center gap-3 p-2 rounded-lg border border-indigo-200 bg-indigo-50">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${colors.bg} ${colors.text}`}>
                      {chunk.label}
                    </span>
                    <span className="font-medium text-slate-800">"{chunk.text}"</span>
                    <span className="text-xs text-indigo-500 ml-auto">(Added manually)</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <input 
              type="text" 
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Nhập cụm từ bị sót..." 
              className="flex-1 text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <select 
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value as OhmLabel)}
              className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="GREEN">GREEN</option>
              <option value="BLUE">BLUE</option>
              <option value="RED">RED</option>
              <option value="PINK">PINK</option>
            </select>
            <button 
              onClick={handleAddNewChunk}
              className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Submit Action */}
        <div className="pt-4">
          <button 
            onClick={handleSubmit}
            disabled={isSaving}
            className="w-full bg-indigo-100 hover:bg-indigo-200 disabled:bg-slate-100 disabled:text-slate-400 text-indigo-700 font-semibold py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
          >
            {isSubmitted ? (
              <>
                <Check className="w-5 h-5" />
                Đã lưu Feedback vào Database!
              </>
            ) : isSaving ? (
              <>
                <Save className="w-5 h-5 animate-pulse" />
                Đang lưu Feedback...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Submit Feedback & Update Memory
              </>
            )}
          </button>

          {submitError && (
            <p className="text-sm text-red-600 mt-2">{submitError}</p>
          )}
        </div>

      </div>
    </div>
  );
};