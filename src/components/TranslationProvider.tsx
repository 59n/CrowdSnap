"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Dictionary = any; // For flexible nested objects

interface TranslationContextType {
  t: (keyPath: string, values?: Record<string, string | number>) => string;
  locale: string;
  setLocale: (locale: string) => void;
}

const TranslationContext = createContext<TranslationContextType | null>(null);

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }
  return context;
};

export function TranslationProvider({
  children,
  initialDictionary,
  initialLocale,
  cookieName = "NEXT_LOCALE",
}: {
  children: React.ReactNode;
  initialDictionary: Dictionary;
  initialLocale: string;
  cookieName?: string;
}) {
  const [dictionary, setDictionary] = useState<Dictionary>(initialDictionary);
  const [locale, setLocaleState] = useState(initialLocale);
  const router = useRouter();

  // Sync state if server passes a new prop
  useEffect(() => {
     setDictionary(initialDictionary);
     setLocaleState(initialLocale);
  }, [initialDictionary, initialLocale]);

  const setLocale = (newLocale: string) => {
    // Save to cookie so the server knows
    document.cookie = `${cookieName}=${newLocale}; path=/; max-age=31536000`; // 1 year expiry
    setLocaleState(newLocale);
    // Hard refresh to trigger server components to fetch new dictionary
    router.refresh();
  };

  const t = (keyPath: string, values?: Record<string, string | number>): string => {
    const keys = keyPath.split(".");
    let result = dictionary;

    for (const key of keys) {
      if (result && typeof result === "object" && key in result) {
        result = result[key];
      } else {
        return keyPath; // Fallback to the key itself if not found
      }
    }

    if (typeof result !== "string") {
      return keyPath;
    }

    // Handle token replacement (e.g. {count})
    if (values) {
      let templated = result;
      for (const [key, value] of Object.entries(values)) {
        templated = templated.replace(new RegExp(`{${key}}`, "g"), String(value));
      }
      return templated;
    }

    return result;
  };

  return (
    <TranslationContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </TranslationContext.Provider>
  );
}
