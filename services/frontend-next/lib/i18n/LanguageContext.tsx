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
}

const dictionaries: Record<Locale, any> = {
  id: idDict,
  en: enDict,
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
  const [locale, setLocaleState] = useState<Locale>("id");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (saved === "id" || saved === "en") {
        setLocaleState(saved);
        document.documentElement.lang = saved;
      }
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
      const activeDict = dictionaries[locale] || idDict;
      let val = getNestedValue(activeDict, path);

      // Fallback to Indonesian if missing in current dictionary
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
      const fallback = getNestedValue(idDict, `diseases.${trimmed}`);
      return (typeof fallback === "string" ? fallback : trimmed);
    },
    [locale],
  );

  const translateSeverity = useCallback(
    (severity?: string | null): string => {
      if (!severity) return "";
      const s = severity.toUpperCase().trim();
      const translated = getNestedValue(dictionaries[locale], `severity.${s}`);
      if (translated && typeof translated === "string") return translated;
      return s;
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
      locale: "id",
      setLocale: () => {},
      toggleLocale: () => {},
      t: (path: string, params?: Record<string, string | number>) => {
        let val = getNestedValue(idDict, path);
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
    };
  }
  return ctx;
}
