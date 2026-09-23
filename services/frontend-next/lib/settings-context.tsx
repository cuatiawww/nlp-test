'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SidebarGroupConfig, DEFAULT_NAVIGATION_CONFIG } from '@/lib/menu';
import { setNavigationCache } from '@/lib/auth';

export interface SystemSettings {
  app_name: string;
  app_tagline: string;
  sidebar_logo_url: string;
  login_logo_url: string;
  favicon_url: string;
  footer_text: string;
  ticker_text: string;
  navigation_menu?: SidebarGroupConfig[];
}

const DEFAULT_SETTINGS: SystemSettings = {
  app_name: 'ASEAN Real-time AI Surveillance Data',
  app_tagline: 'Real-time multilingual data monitoring',
  sidebar_logo_url: '',
  login_logo_url: '',
  favicon_url: '',
  footer_text: 'ASEAN Real-time AI Surveillance Data',
  ticker_text: '',
  navigation_menu: DEFAULT_NAVIGATION_CONFIG,
};

interface SettingsContextType {
  settings: SystemSettings;
  loading: boolean;
  refetch: () => void;
  updateSettings: (partial: Partial<SystemSettings>) => void;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: DEFAULT_SETTINGS,
  loading: false,
  refetch: () => {},
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/nlp/api/v1/console/settings?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.config_data) {
          const config = json.data.config_data;
          const navMenu = Array.isArray(config.navigation_menu) && config.navigation_menu.length > 0
            ? config.navigation_menu
            : DEFAULT_SETTINGS.navigation_menu;
          setNavigationCache(navMenu);
          setSettings({
            ...DEFAULT_SETTINGS,
            ...config,
            navigation_menu: navMenu,
            app_name: config.app_name === 'ASEAN Disease Outbreak Surveillance AI'
              ? DEFAULT_SETTINGS.app_name
              : config.app_name,
            app_tagline: config.app_tagline === 'Real-time Multilingual Disease Monitoring'
              ? DEFAULT_SETTINGS.app_tagline
              : config.app_tagline,
            footer_text: config.footer_text === 'Disease Surveillance AI'
              ? DEFAULT_SETTINGS.footer_text
              : config.footer_text,
          });
        }
      }
    } catch {
      // use defaults silently
    } finally {
      setLoading(false);
    }
  }, []);

  const updateSettings = useCallback((partial: Partial<SystemSettings>) => {
    if (partial.navigation_menu) {
      setNavigationCache(partial.navigation_menu);
    }
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refetch: fetchSettings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
