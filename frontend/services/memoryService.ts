import { FeedbackPayload, MemoryHint } from '../types.ts';

export function getAppKeyFromUrl(): string {
  return new URLSearchParams(window.location.search).get('key') || '';
}

function buildHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-App-Key': getAppKeyFromUrl()
  };
}

export async function fetchMemoryHints(transcript: string, sessionId?: string): Promise<MemoryHint[]> {
  if (!transcript.trim()) return [];

  const params = new URLSearchParams({ transcript });
  if (sessionId) params.set('sessionId', sessionId);

  const response = await fetch(`/memory-hints?${params.toString()}`, {
    method: 'GET',
    headers: buildHeaders()
  });

  if (!response.ok) {
    throw new Error(`memory_hints_failed_${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.hints) ? data.hints : [];
}

export async function submitFeedback(payload: FeedbackPayload): Promise<{ ok: boolean; saved: number }> {
  const response = await fetch('/feedback', {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`feedback_submit_failed_${response.status}: ${errorText}`);
  }

  return response.json();
}
