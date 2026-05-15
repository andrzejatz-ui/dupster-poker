import Link from 'next/link';
import { NeonCard } from '@/components/ui/NeonCard';
import { NeonButton } from '@/components/ui/NeonButton';

export default function Landing() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-10">
          <span className="inline-block text-xs uppercase tracking-[0.4em] text-neon-cyan/80 font-display">
            Private Tables · Play Money · Eigene Infrastruktur
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl font-bold tracking-tight">
            <span className="text-glow-violet text-neon-violet">Neon</span>{' '}
            <span className="text-glow-cyan text-neon-cyan">Poker</span>
          </h1>
          <p className="mt-4 text-white/60 max-w-xl mx-auto">
            Texas Hold’em in einer privaten Lobby. Zugang nur per Invite-Link
            und genehmigter Player-ID. Karten werden ausschließlich
            serverseitig verteilt.
          </p>
        </div>

        <NeonCard glow="violet" strong className="text-center">
          <h2 className="font-display text-2xl mb-2">Willkommen am Tisch</h2>
          <p className="text-white/55 text-sm mb-6">
            Tippe gleich deine Player-ID ein — sie wird bei jeder Session
            neu abgefragt und niemals lokal gespeichert.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/join">
              <NeonButton variant="primary" size="lg">
                Mit Player-ID einsteigen →
              </NeonButton>
            </Link>
            <Link href="/admin/login">
              <NeonButton variant="ghost" size="lg">
                Admin-Login
              </NeonButton>
            </Link>
          </div>
        </NeonCard>

        <p className="text-center text-xs text-white/30 mt-8 font-mono">
          Build v0.1 · No real money · No external account binding
        </p>
      </div>
    </main>
  );
}
