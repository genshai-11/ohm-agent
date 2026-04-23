import React, { useEffect, useState } from 'react';
import { AgentConfig, LlmProvider, ModelOption } from '../types.ts';
import { fetchProviderModels, getAgentConfig, updateAgentConfig } from '../services/providerConfigService.ts';

interface AdminConfigPageProps {
  onConfigUpdated?: (config: AgentConfig) => void;
}

const DEFAULT_CONFIG: AgentConfig = {
  defaultProvider: 'gemini',
  fallbackEnabled: true,
  fallbackOrder: ['gemini', 'customOpenAI'],
  providers: {
    gemini: { enabled: true, model: 'gemini-2.5-flash', apiKey: '' },
    customOpenAI: { enabled: false, model: 'gpt-4o-mini', baseUrl: '', apiKey: '' }
  }
};

export const AdminConfigPage: React.FC<AdminConfigPageProps> = ({ onConfigUpdated }) => {
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_CONFIG);
  const [geminiModels, setGeminiModels] = useState<ModelOption[]>([]);
  const [customModels, setCustomModels] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const loaded = await getAgentConfig();
      setConfig(loaded);
      onConfigUpdated?.(loaded);
    } catch (err: any) {
      setError(err?.message || 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async (provider: LlmProvider) => {
    try {
      const models = await fetchProviderModels(provider);
      if (provider === 'gemini') {
        setGeminiModels(models);
      } else {
        setCustomModels(models);
      }
    } catch (err: any) {
      setError(err?.message || `Failed to fetch ${provider} models`);
    }
  };

  useEffect(() => {
    loadConfig();
    loadModels('gemini');
    loadModels('customOpenAI');
  }, []);

  const saveConfig = async () => {
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const updated = await updateAgentConfig(config);
      setConfig(updated);
      onConfigUpdated?.(updated);
      setMessage('Configuration saved successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Admin · Agent Provider Config</h2>
        <button onClick={loadConfig} className="text-sm px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" disabled={loading}>
          Reload
        </button>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {message && <div className="text-sm text-green-600">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">Default Provider</span>
          <select
            value={config.defaultProvider}
            onChange={(e) => setConfig(prev => ({ ...prev, defaultProvider: e.target.value as LlmProvider }))}
            className="w-full border border-slate-300 rounded px-3 py-2"
          >
            <option value="gemini">Gemini</option>
            <option value="customOpenAI">Custom OpenAI-compatible</option>
          </select>
        </label>

        <label className="space-y-1 text-sm flex items-center gap-2 mt-6">
          <input
            type="checkbox"
            checked={config.fallbackEnabled}
            onChange={(e) => setConfig(prev => ({ ...prev, fallbackEnabled: e.target.checked }))}
          />
          <span className="font-medium text-slate-700">Enable fallback chain</span>
        </label>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-slate-800">Gemini Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Enable Gemini</span>
            <input
              type="checkbox"
              checked={config.providers.gemini.enabled}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                providers: { ...prev.providers, gemini: { ...prev.providers.gemini, enabled: e.target.checked } }
              }))}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Gemini API Key {config.providers.gemini.hasApiKey ? '(configured)' : ''}</span>
            <input
              type="password"
              value={config.providers.gemini.apiKey || ''}
              placeholder="Leave blank to keep existing"
              onChange={(e) => setConfig(prev => ({
                ...prev,
                providers: { ...prev.providers, gemini: { ...prev.providers.gemini, apiKey: e.target.value } }
              }))}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Gemini Model</span>
            <div className="flex gap-2">
              <select
                value={config.providers.gemini.model}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  providers: { ...prev.providers, gemini: { ...prev.providers.gemini, model: e.target.value } }
                }))}
                className="w-full border border-slate-300 rounded px-3 py-2"
              >
                {geminiModels.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
              </select>
              <button type="button" className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200" onClick={() => loadModels('gemini')}>Fetch</button>
            </div>
          </label>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-slate-800">Custom OpenAI-compatible Provider</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Enable Custom Provider</span>
            <input
              type="checkbox"
              checked={config.providers.customOpenAI.enabled}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                providers: { ...prev.providers, customOpenAI: { ...prev.providers.customOpenAI, enabled: e.target.checked } }
              }))}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Base URL</span>
            <input
              value={config.providers.customOpenAI.baseUrl || ''}
              placeholder="https://your-endpoint/v1"
              onChange={(e) => setConfig(prev => ({
                ...prev,
                providers: { ...prev.providers, customOpenAI: { ...prev.providers.customOpenAI, baseUrl: e.target.value } }
              }))}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Custom API Key {config.providers.customOpenAI.hasApiKey ? '(configured)' : ''}</span>
            <input
              type="password"
              value={config.providers.customOpenAI.apiKey || ''}
              placeholder="Leave blank to keep existing"
              onChange={(e) => setConfig(prev => ({
                ...prev,
                providers: { ...prev.providers, customOpenAI: { ...prev.providers.customOpenAI, apiKey: e.target.value } }
              }))}
              className="w-full border border-slate-300 rounded px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700">Custom Model</span>
            <div className="flex gap-2">
              <select
                value={config.providers.customOpenAI.model}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  providers: { ...prev.providers, customOpenAI: { ...prev.providers.customOpenAI, model: e.target.value } }
                }))}
                className="w-full border border-slate-300 rounded px-3 py-2"
              >
                {(customModels.length ? customModels : [{ id: config.providers.customOpenAI.model, displayName: config.providers.customOpenAI.model, provider: 'customOpenAI' as const }]).map((m) => (
                  <option key={m.id} value={m.id}>{m.displayName}</option>
                ))}
              </select>
              <button type="button" className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200" onClick={() => loadModels('customOpenAI')}>Fetch</button>
            </div>
          </label>
        </div>
      </div>

      <button
        onClick={saveConfig}
        disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium disabled:bg-indigo-300"
      >
        {saving ? 'Saving...' : 'Save Provider Config'}
      </button>
    </div>
  );
};
