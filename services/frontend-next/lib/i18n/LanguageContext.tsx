"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import idDict from "@/locales/id.json";
import enDict from "@/locales/en.json";

export type Locale = "id" | "en";

export interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  translateDisease: (name?: string | null) => string;
  translateSeverity: (severity?: string | null) => string;
  translateSentiment: (sentiment?: string | null) => string;
  translateRelevance: (relevance?: string | null) => string;
}

const dictionaries: Record<Locale, any> = {
  en: enDict,
  id: idDict,
};

const STORAGE_KEY = "disease-app-locale";

const LanguageContext = createContext<LanguageContextType | null>(null);

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let curr = obj;
  for (const part of parts) {
    if (curr && typeof curr === "object" && part in curr) {
      curr = curr[part];
    } else {
      return undefined;
    }
  }
  return curr;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      setLocaleState("en");
      localStorage.setItem(STORAGE_KEY, "en");
      document.documentElement.lang = "en";
    } catch {
      // ignore localStorage errors in private modes
    }
    setMounted(true);
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.documentElement.lang = newLocale;
    } catch {
      // ignore
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "id" ? "en" : "id");
  }, [locale, setLocale]);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const activeDict = dictionaries[locale] || enDict;
      let val = getNestedValue(activeDict, path);

      // Fallback to English if missing in current dictionary
      if (val === undefined || val === null) {
        val = getNestedValue(enDict, path);
      }

      // Fallback to Indonesian if still missing
      if (val === undefined || val === null) {
        val = getNestedValue(idDict, path);
      }

      // If still missing, return the path itself as fallback
      if (val === undefined || val === null) {
        return path;
      }

      if (typeof val !== "string") {
        return String(val);
      }

      // Replace interpolation placeholders e.g. {count}, {disease}
      if (params) {
        return Object.entries(params).reduce((acc, [k, v]) => {
          return acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }, val);
      }

      return val;
    },
    [locale],
  );

  const translateDisease = useCallback(
    (name?: string | null): string => {
      if (!name) return "";
      const trimmed = name.trim();
      const translated = getNestedValue(dictionaries[locale], `diseases.${trimmed}`);
      if (translated && typeof translated === "string") return translated;
      const fallbackEn = getNestedValue(enDict, `diseases.${trimmed}`);
      if (fallbackEn && typeof fallbackEn === "string") return fallbackEn;
      const fallbackId = getNestedValue(idDict, `diseases.${trimmed}`);
      if (fallbackId && typeof fallbackId === "string") return fallbackId;
      return trimmed;
    },
    [locale],
  );

  const translateSeverity = useCallback(
    (severity?: string | null): string => {
      if (!severity) return "";
      const s = severity.toUpperCase().trim();
      const translated = getNestedValue(dictionaries[locale], `severity.${s}`);
      if (translated && typeof translated === "string") return translated;
      const fallbackEn = getNestedValue(enDict, `severity.${s}`);
      if (fallbackEn && typeof fallbackEn === "string") return fallbackEn;
      return s;
    },
    [locale],
  );

  const translateSentiment = useCallback(
    (sentiment?: string | null): string => {
      if (!sentiment) return "";
      const s = sentiment.toLowerCase().trim();
      const translated = getNestedValue(dictionaries[locale], `sentiment.${s}`);
      if (translated && typeof translated === "string") return translated;
      const fallbackEn = getNestedValue(enDict, `sentiment.${s}`);
      if (fallbackEn && typeof fallbackEn === "string") return fallbackEn;
      return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    },
    [locale],
  );

  const translateRelevance = useCallback(
    (relevance?: string | null): string => {
      if (!relevance) return "";
      const r = relevance.toLowerCase().trim();
      const translated = getNestedValue(dictionaries[locale], `relevance.${r}`);
      if (translated && typeof translated === "string") return translated;
      const fallbackEn = getNestedValue(enDict, `relevance.${r}`);
      if (fallbackEn && typeof fallbackEn === "string") return fallbackEn;
      return r.length > 0 ? r.charAt(0).toUpperCase() + r.slice(1) : r;
    },
    [locale],
  );

  return (
    <LanguageContext.Provider
      value={{
        locale,
        setLocale,
        toggleLocale,
        t,
        translateDisease,
        translateSeverity,
        translateSentiment,
        translateRelevance,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Graceful fallback if used outside Provider
    return {
      locale: "en",
      setLocale: () => {},
      toggleLocale: () => {},
      t: (path: string, params?: Record<string, string | number>) => {
        let val = getNestedValue(enDict, path);
        if (val === undefined || val === null) val = getNestedValue(idDict, path);
        if (typeof val !== "string") return path;
        if (params) {
          return Object.entries(params).reduce((acc, [k, v]) => {
            return acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }, val);
        }
        return val;
      },
      translateDisease: (n?: string | null) => n || "",
      translateSeverity: (s?: string | null) => s || "",
      translateSentiment: (s?: string | null) => s || "",
      translateRelevance: (r?: string | null) => r || "",
    };
  }
  return ctx;
}
