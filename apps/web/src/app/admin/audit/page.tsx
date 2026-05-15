'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { adminCall, getAdminToken } from '@/lib/admin';
import { useT } from '@/i18n/context';

interface AuditRow {
  id: number;
  admin_id: string;
  action: string;
  target_player_id: string | null;
  target_table_id: string | null;
  payload: unknown;
  reason: string | null;
  created_at: string;
}

export default function AuditPage() {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);

  useEffect(() => {
    if (!getAdminToken()) {
      router.replace('/admin/login');
      return;
    }
    adminCall('/audit').then((r) => setRows(r.body.entries ?? []));
  }, [router]);

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 sm:py-10 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6 pr-24 sm:pr-36">
        <h1 className="font-display text-3xl text-gold text-glow-gold">{t('audit.title')}</h1>
        <Link href="/admin"><NeonButton variant="ghost" size="sm">← {t('common.back')}</NeonButton></Link>
      </header>
      <NeonCard>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-left text-white/40 uppercase tracking-widest">
              <th className="py-2">{t('audit.col.time')}</th>
              <th>{t('audit.col.action')}</th>
              <th>{t('audit.col.player')}</th>
              <th>{t('audit.col.table')}</th>
              <th>{t('audit.col.reason')}</th>
              <th>{t('audit.col.payload')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 align-top">
                <td className="py-2 text-white/40 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="text-gold">{r.action}</td>
                <td className="text-white/60">{r.target_player_id?.slice(0, 8) ?? '—'}</td>
                <td className="text-white/60">{r.target_table_id?.slice(0, 8) ?? '—'}</td>
                <td className="text-white/60">{r.reason ?? '—'}</td>
                <td className="text-white/40">
                  <pre className="whitespace-pre-wrap break-all">{r.payload ? JSON.stringify(r.payload) : '—'}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </NeonCard>
    </main>
  );
}
