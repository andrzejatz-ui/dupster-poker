'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { adminCall, getAdminToken } from '@/lib/admin';

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
    <main className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl text-glow-violet text-neon-violet">Audit-Log</h1>
        <Link href="/admin"><NeonButton variant="ghost" size="sm">← Zurück</NeonButton></Link>
      </header>
      <NeonCard>
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-left text-white/40 uppercase tracking-widest">
              <th className="py-2">Zeit</th>
              <th>Action</th>
              <th>Spieler</th>
              <th>Tisch</th>
              <th>Reason</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5 align-top">
                <td className="py-2 text-white/40 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="text-neon-cyan">{r.action}</td>
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
