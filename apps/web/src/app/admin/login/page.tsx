'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';
import { NeonInput } from '@/components/ui/Input';
import { adminLogin } from '@/lib/api';
import { useT } from '@/i18n/context';

const ADMIN_TOKEN_KEY = 'np_admin_token';

export default function AdminLoginPage() {
  const t = useT();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { status, body } = await adminLogin(username, password);
    setBusy(false);
    if (status === 200 && body.token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, body.token);
      router.replace('/admin');
      return;
    }
    setError(body.error ?? t('admin.login.errors.failed'));
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12">
      <NeonCard glow="violet" strong className="max-w-md w-full">
        <h1 className="font-display text-3xl text-glow-violet text-neon-violet mb-2">
          {t('admin.login.title')}
        </h1>
        <p className="text-white/55 text-sm mb-6">{t('admin.login.body')}</p>
        <form onSubmit={onSubmit} className="space-y-5">
          <NeonInput
            id="admin-user"
            label={t('admin.login.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="off"
            error={error}
          />
          <NeonInput
            id="admin-pw"
            label={t('admin.login.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <NeonButton variant="primary" size="lg" type="submit" disabled={busy} className="w-full">
            {busy ? t('admin.login.submitting') : t('admin.login.submit')}
          </NeonButton>
        </form>
      </NeonCard>
    </main>
  );
}
