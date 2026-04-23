import React, { useState, useCallback } from 'react';
import { AgentRequest, AgentResponse, LABEL_COLORS } from './types.ts';
import { evaluateTranscript } from './services/agentService.ts';
import { ScoreCard } from './components/ScoreCard.tsx';
import { TranscriptHighlighter } from './components/TranscriptHighlighter.tsx';
import { FeedbackPanel } from './components/FeedbackPanel.tsx';
import { BrainCircuit, Loader2, Settings2, AlertCircle, CheckCircle2, Bug, Database } from 'lucide-react';

const SAMPLE_TRANSCRIPTS = [
  "Từ bây giờ, cậu nên nhớ rằng mật ngọt chết ruồi. Đừng có tham lam quá.",
  "Nói chung, nếu cậu mà biết nghĩ thì cậu đâu có đổ thêm dầu vào lửa như vậy. Thật là lố bịch!",
  "Thẳng thắn mà nói, tui không hiểu cậu lấy đâu ra nhiều tiền đến thế để mua cái dép lào đó. Tiền nào của đó thôi!",
  "Khi chiếc thuyền cứu hộ lật giữa cơn giông và mọi người đều tưởng chúng tôi sẽ mất mạng trong gang tấc, tôi vẫn nắm tay người bạn của mình và nói rằng nếu sau biến cố này chúng tôi còn sống để chọn một cuộc đời khác, thì tui chẳng có gì phải hối hận cả, vì ở khoảnh khắc hiểm nghèo nhất, chúng tôi đã sống thật lòng và can đảm."
];

function getOrCreateSessionId(): string {
  const storageKey = 'ohm_agent_session_id';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const created = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  localStorage.setItem(storageKey, created);
  return created;
}

export default function App() {
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [transcript, setTranscript] = useState(SAMPLE_TRANSCRIPTS[0]);
  const [reactionDelay, setReactionDelay] = useState<number>(1500);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!transcript.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    const request: AgentRequest = {
      transcript,
      model: 'gemini',
      reactionDelayMs: reactionDelay,
      context: { language: 'vi', sessionId },
      flags: { useMemoryAssist: true, returnDebug: true }
    };

    try {
      const response = await evaluateTranscript(request);
      setResult(response);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred during analysis.");
    } finally {
      setIsLoading(false);
    }
  }, [transcript, reactionDelay, sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex items-center gap-3 pb-4 border-b border-slate-200">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <BrainCircuit className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">OHM Memory-Orchestrated Agent</h1>
            <p className="text-sm text-slate-500">Integration Adapter & Testing UI (v1 Spec)</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-6">
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Transcript Input
                </h2>
                <div className="flex gap-2 flex-wrap justify-end">
                  {SAMPLE_TRANSCRIPTS.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setTranscript(SAMPLE_TRANSCRIPTS[idx])}
                      className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition-colors"
                    >
                      Ex {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
              
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                className="w-full h-40 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                placeholder="Nhập câu nói tiếng Việt vào đây..."
              />

              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <Settings2 className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Simulated Reaction Delay (ms) - "R" Coefficient
                  </label>
                  <input
                    type="range"
                    min="500"
                    max="6000"
                    step="100"
                    value={reactionDelay}
                    onChange={(e) => setReactionDelay(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
                <span className="text-sm font-mono font-medium w-12 text-right">
                  {reactionDelay}
                </span>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isLoading || !transcript.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing Pipeline...
                  </>
                ) : (
                  'Run Orchestrated Evaluation'
                )}
              </button>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Label Constitution (Hard Constraints)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-16 text-center py-1 rounded text-xs font-bold ${LABEL_COLORS.GREEN.bg} ${LABEL_COLORS.GREEN.text}`}>GREEN</span>
                  <span className="text-slate-600">Cụm từ mở đầu câu / chuyển ý (5 Ohm)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-16 text-center py-1 rounded text-xs font-bold ${LABEL_COLORS.BLUE.bg} ${LABEL_COLORS.BLUE.text}`}>BLUE</span>
                  <span className="text-slate-600">Khung câu nền tảng (7 Ohm)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-16 text-center py-1 rounded text-xs font-bold ${LABEL_COLORS.RED.bg} ${LABEL_COLORS.RED.text}`}>RED</span>
                  <span className="text-slate-600">Thành ngữ / ẩn dụ bản ngữ (9 Ohm)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-16 text-center py-1 rounded text-xs font-bold ${LABEL_COLORS.PINK.bg} ${LABEL_COLORS.PINK.text}`}>PINK</span>
                  <span className="text-slate-600">Từ khóa chính / thuật ngữ (3 Ohm)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7 space-y-6">
            {result ? (
              <>
                <ScoreCard result={result} />

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                  <h3 className="text-lg font-semibold">Semantic Chunks</h3>
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                    <TranscriptHighlighter transcript={result.transcriptRaw} chunks={result.chunks} />
                  </div>
                  
                  {result.chunks.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {result.chunks.map((chunk, idx) => {
                        const colors = LABEL_COLORS[chunk.label];
                        return (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 bg-white">
                            <span className={`shrink-0 px-2 py-1 rounded text-xs font-bold ${colors.bg} ${colors.text}`}>
                              {chunk.label}
                            </span>
                            <div>
                              <p className="font-medium text-slate-800">"{chunk.text}"</p>
                              <p className="text-sm text-slate-500 mt-1">{chunk.reason}</p>
                            </div>
                            <div className="ml-auto text-xs font-mono text-slate-400">
                              {(chunk.confidence * 100).toFixed(0)}% conf
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-slate-500 text-sm italic">No valid chunks detected.</p>
                  )}
                </div>

                {/* Human Review Gate (Feedback Panel) */}
                <FeedbackPanel transcript={result.transcriptRaw} chunks={result.chunks} sessionId={sessionId} />

                {result.debug && (
                  <div className="bg-slate-800 p-6 rounded-xl shadow-sm text-slate-300 space-y-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Bug className="w-5 h-5" /> Debug Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                      <div>
                        <span className="text-slate-500 block">Pipeline Latency</span>
                        <span className="text-white">{result.elapsedMs}ms</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block flex items-center gap-1">
                          <Database className="w-3 h-3" /> Memory Hints Sent
                        </span>
                        <span className="text-white">{result.debug.memoryHits}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Self-Check Passed</span>
                        <span className="flex items-center gap-1 text-white">
                          {result.debug.selfCheckPassed ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
                          {result.debug.selfCheckPassed.toString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Raw Candidates</span>
                        <span className="text-white">{result.debug.rawChunkCount}</span>
                      </div>
                    </div>
                    
                    {result.debug.dropReasons.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-700">
                        <span className="text-slate-500 block text-sm mb-2">Drop Reasons (Self-Check)</span>
                        <ul className="list-disc list-inside text-xs text-red-300 space-y-1">
                          {result.debug.dropReasons.map((reason, idx) => (
                            <li key={idx}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <BrainCircuit className="w-12 h-12 mb-4 text-slate-300" />
                <p>Enter a transcript and run evaluation to see results.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}