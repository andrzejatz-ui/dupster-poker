'use client';

import { type ReactNode } from 'react';
import { I18nProvider } from '@/i18n/context';
import { LanguageSwitcherCorner } from './LanguageSwitcher';

/**
 * Client wrapper used by the (server-side) root layout. Provides the
 * translation context and renders the floating language switcher.
 */
export function I18nShell({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <LanguageSwitcherCorner />
      {children}
    </I18nProvider>
  );
}
