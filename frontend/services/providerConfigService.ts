import { AgentConfig, LlmProvider, ModelOption } from '../types.ts';

const ADMIN_TOKEN_KEY = 'ohm_admin_password';

export function setAdminPassword(password: string) {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, password);
}

export function clearAdminPassword() {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function hasAdminPassword(): boolean {
  return Boolean(sessionStorage.getItem(ADMIN_TOKEN_KEY));
}

function getAdminHeaders(): HeadersInit {
  const password = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
  return {
    'Content-Type': 'application/json',
    'X-Admin-Password': password
  };
}

function getPublicHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json'
  };
}

export async function getAgentConfig(): Promise<AgentConfig> {
  const response = await fetch('/admin/config', {
    method: 'GET',
    headers: getAdminHeaders()
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
    headers: getAdminHeaders(),
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
    headers: getPublicHeaders()
  });

  if (!response.ok) {
    throw new Error(`fetch_models_failed_${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.models) ? data.models : [];
}
