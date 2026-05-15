'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '@/i18n/context';

export interface ChatLine {
  from: string;
  body: string;
  at: number;
  seatIndex: number | null;
}

interface Props {
  lines: ChatLine[];
  onSend: (body: string) => void;
}

export function ChatBox({ lines, onSend }: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  function submit() {
    const b = draft.trim();
    if (!b) return;
    onSend(b);
    setDraft('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submit();
  }

  return (
    <div className="surface rounded-2xl flex flex-col h-full min-h-[180px] w-full">
      <div className="px-3 py-2 border-b border-rim-faint font-display text-[10px] uppercase tracking-[0.22em] text-ink-muted">
        {t('chat.title')}
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm">
        {lines.length === 0 ? (
          <div className="text-ink-muted italic">{t('chat.empty')}</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="leading-snug">
              <span className="font-display text-gold">{l.from}:</span>{' '}
              <span className="text-ink-primary break-words">{l.body}</span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-rim-faint p-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={280}
          placeholder={t('chat.placeholder')}
          className="flex-1 px-3 py-1.5 rounded-md bg-obsidian-soft border border-rim-bright text-sm focus:border-gold outline-none"
        />
        <button
          onClick={submit}
          className="px-3 py-1.5 rounded-md border border-gold/40 text-gold text-[10px] uppercase tracking-[0.22em] font-display hover:bg-gold/10"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
