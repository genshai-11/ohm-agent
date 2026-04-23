import { AgentConfig, LlmProvider, ModelOption } from '../types.ts';
import { getAppKeyFromUrl } from './memoryService.ts';

function getHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-App-Key': getAppKeyFromUrl()
  };
}

export async function getAgentConfig(): Promise<AgentConfig> {
  const response = await fetch('/admin/config', {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) {
    throw new Error(`get_config_failed_${response.status}`);
  }

  const data = await response.json();
  return data.config;
}

export async function updateAgentConfig(payload: Partial<AgentConfig>): Promise<AgentConfig> {
  const response = await fetch('/admin/config', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`update_config_failed_${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.config;
}

export async function fetchProviderModels(provider: LlmProvider): Promise<ModelOption[]> {
  const response = await fetch(`/models?provider=${provider}`, {
    method: 'GET',
    headers: getHeaders()
  });

  if (!response.ok) {
    throw new Error(`fetch_models_failed_${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}
