import React, { useState, useEffect } from 'react';

interface Settings {
  serverUrl: string;
  geminiApiKey: string;
  theme: 'dark' | 'auto';
}

const DEFAULT_SETTINGS: Settings = {
  serverUrl: 'https://page-mind-ai-assistant.vercel.app',
  geminiApiKey: '',
  theme: 'dark',
};

export default function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(['ai_research_settings'], (result) => {
      if (result.ai_research_settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...result.ai_research_settings });
      }
    });
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set({ ai_research_settings: settings }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: '#1e1e28',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#e8e8ed',
    fontSize: '14px',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  return (
    <div style={{ maxWidth: 480, width: '100%' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        🔬 PageMind
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 32 }}>
        Configure your extension settings
      </p>

      <div style={{ background: '#16161d', borderRadius: 12, padding: 24, border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={sectionStyle}>
          <label style={labelStyle}>Backend Server URL</label>
          <input
            style={inputStyle}
            value={settings.serverUrl}
            onChange={(e) => setSettings(s => ({ ...s, serverUrl: e.target.value }))}
            placeholder="https://page-mind-ai-assistant.vercel.app"
          />
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            The URL where your Node.js backend is running.
          </p>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Gemini API Key (Optional)</label>
          <input
            style={inputStyle}
            type="password"
            value={settings.geminiApiKey}
            onChange={(e) => setSettings(s => ({ ...s, geminiApiKey: e.target.value }))}
            placeholder="AIza..."
          />
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
            If set, overrides the key in server .env file.
          </p>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Theme</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={settings.theme}
            onChange={(e) => setSettings(s => ({ ...s, theme: e.target.value as 'dark' | 'auto' }))}
          >
            <option value="dark">Dark Mode</option>
            <option value="auto">Auto (System)</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          style={{
            width: '100%',
            padding: '10px',
            background: saved ? '#22c55e' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            fontFamily: 'inherit',
          }}
        >
          {saved ? '✓ Saved!' : 'Save Settings'}
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 16 }}>
        PageMind v1.0.0
      </p>
    </div>
  );
}
