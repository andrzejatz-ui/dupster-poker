# Neon Poker

Echtzeit-Multiplayer-Texas-Hold'em mit Play-Money-Chips. Privatzugang per
Invite-Link, Admin-Approval, serverseitige Spielregie.

> **Komplett eigenständig.** Keine Anbindung an bestehende Arbeitskonten,
> Produktiv-Datenbanken oder Connector-Tools. Alles in einer separaten,
> projektbezogenen Cloud-Identität.

## Inhalt

```
neon-poker/
├── apps/
│   ├── server/      Node.js + Socket.IO. Engine + DB + Admin-API.
│   └── web/         Next.js 14. UI für Spieler, Lobby, Tisch, Admin.
├── packages/
│   └── shared/      TypeScript-Types und Socket-Event-Schema.
└── docs/            Architektur, MVP, Datenmodelle, Events, Admin-Spec.
```

## Quickstart

Voraussetzungen: Node.js ≥ 20, pnpm ≥ 9, eine eigene leere Postgres-DB
(Supabase oder Neon, eigene Projekt-Org — **nicht** das Arbeitskonto).

```bash
# 1. Repo klonen, dann
pnpm install

# 2. Env-Vorlage kopieren und ausfüllen
cp .env.example .env
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local

# 3. Schema einspielen
psql "$DATABASE_URL" -f apps/server/src/db/schema.sql

# 4. Dev starten (Server :4000, Web :3000)
pnpm dev
```

Beim ersten Start des Servers wird der Bootstrap-Admin angelegt
(`BOOTSTRAP_ADMIN_USERNAME` / `BOOTSTRAP_ADMIN_PASSWORD`). Damit auf
`http://localhost:3000/admin` einloggen.

## Spieler-Flow

1. Admin legt unter `/admin/players` eine Player-ID an (oder Spieler joint
   selbst und landet in `pending`).
2. Admin approved und vergibt Chips.
3. Spieler öffnet den privaten Invite-Link `/join?invite=…`.
4. Spieler tippt seine Player-ID ein, kommt in die Lobby.
5. An einem Tisch Buy-in, dann spielen.

## Sicherheits- und Datenschutz-Hinweise

- `.env` niemals committen.
- Bootstrap-Admin-Passwort nach erstem Login ändern (Endpoint kommt in V2;
  bis dahin via DB-Update).
- Pro Cloud-Provider eine eigene Org/Projekt. Kein Sharing mit
  Arbeitsumgebungen.

## Roadmap (post-MVP)

- Turniere mit Blind-Schedules
- Private Clubs (`clubs` → scoped Tische)
- Replay-Viewer auf Basis `hand_actions`
- Ranking-Aggregation
- 2FA für Admin

Details in `docs/ARCHITECTURE.md` und `docs/MVP.md`.
