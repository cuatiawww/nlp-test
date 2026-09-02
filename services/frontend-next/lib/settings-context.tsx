'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export interface SystemSettings {
  app_name: string;
  app_tagline: string;
  sidebar_logo_url: string;
  login_logo_url: string;
  favicon_url: string;
  footer_text: string;
  ticker_text: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  app_name: 'ASEAN Disease Outbreak Surveillance AI',
  app_tagline: 'Real-time Multilingual Disease Monitoring',
  sidebar_logo_url: '',
  login_logo_url: '',
  favicon_url: '',
  footer_text: 'Disease Surveillance AI',
  ticker_text: '',
};

interface SettingsContextType {
  settings: SystemSettings;
  loading: boolean;
  refetch: () => void;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: false,
  refetch: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/nlp/api/v1/console/settings');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.config_data) {
          setSettings({ ...DEFAULT_SETTINGS, ...json.data.config_data });
        }
      }
    } catch {
      // use defaults silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refetch: fetchSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
