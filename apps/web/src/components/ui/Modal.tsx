'use client';

import { type ReactNode, useEffect } from 'react';
import clsx from 'clsx';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Body content. Optional — confirm-style dialogs lean on title + subtitle alone. */
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const widthClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Obsidian-glass modal sitting above the film-grain overlay. Closes on
 * ESC and on backdrop click. Footer is typically a Cancel/Confirm pair.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center px-4 py-6">
      {/* Backdrop above film-grain (which is z 9999) */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-obsidian-bg/80 backdrop-blur-md"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          'surface-strong relative rounded-2xl w-full p-6',
          'shadow-sigil',
          widthClass[width],
        )}
      >
        {/* faint top-edge highlight */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/35 to-transparent rounded-2xl" />

        <h2
          id="modal-title"
          className="font-display text-xl text-gold text-glow-gold tracking-wider"
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-ink-secondary text-sm mt-1">{subtitle}</p>
        )}

        {children && <div className="mt-5 space-y-4">{children}</div>}

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 mt-6">{footer}</div>
        )}
      </div>
    </div>
  );
}
