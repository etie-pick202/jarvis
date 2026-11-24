import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en } from "./en.js";
import { fr, type MessageKey } from "./fr.js";

export type Lang = "fr" | "en";
export type { MessageKey };

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { fr, en };
const STORAGE_KEY = "jarvis.lang";

function initialLang(): Lang {
  const saved = typeof localStorage === "undefined" ? null : localStorage.getItem(STORAGE_KEY);
  if (saved === "fr" || saved === "en") return saved;
  return typeof navigator !== "undefined" && navigator.language.startsWith("en") ? "en" : "fr";
}

interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? initialLang());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key) => DICTIONARIES[lang][key] }),
    [lang, setLang],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n doit être utilisé dans <I18nProvider>");
  return ctx;
}
