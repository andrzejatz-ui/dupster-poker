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
    <div className="glass rounded-2xl flex flex-col h-56 sm:h-72 w-full lg:w-72">
      <div className="px-3 py-2 border-b border-white/10 font-display text-xs uppercase tracking-widest text-white/60">
        {t('chat.title')}
      </div>
      <div ref={ref} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 text-sm">
        {lines.length === 0 ? (
          <div className="text-white/30 italic">{t('chat.empty')}</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="leading-snug">
              <span className="font-display text-neon-cyan">{l.from}:</span>{' '}
              <span className="text-white/80 break-words">{l.body}</span>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-white/10 p-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          maxLength={280}
          placeholder={t('chat.placeholder')}
          className="flex-1 px-3 py-1.5 rounded-lg bg-ink-900/70 border border-white/10 text-sm focus:border-neon-cyan/60 outline-none"
        />
        <button
          onClick={submit}
          className="px-3 py-1.5 rounded-lg border border-neon-cyan/40 text-neon-cyan text-xs font-display hover:shadow-neon-cyan"
        >
          {t('chat.send')}
        </button>
      </div>
    </div>
  );
}
