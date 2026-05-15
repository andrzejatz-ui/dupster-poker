'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { dict, DEFAULT_LOCALE, LOCALES, type Locale, type TKey } from './dict';

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'np_locale';

const Ctx = createContext<I18nValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  const browser = navigator.language?.slice(0, 2).toLowerCase();
  if ((LOCALES as readonly string[]).includes(browser)) return browser as Locale;
  return DEFAULT_LOCALE;
}

/**
 * Substitutes {placeholders} with values. Missing values fall back to the
 * placeholder name, so a typo in a key still produces readable output.
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Always start with DEFAULT_LOCALE on the server to avoid hydration
  // mismatches; switch to the user's preference once mounted.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const t = useCallback<I18nValue['t']>(
    (key, params) => interpolate(dict[locale][key] ?? key, params),
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Shortcut hook when only translation is needed. */
export function useT() {
  return useI18n().t;
}
