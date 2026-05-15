# Neon Poker — Architektur

> Eigenständige Multiplayer-Texas-Hold'em-App. Eigene Infrastruktur, eigene
> Datenbank, eigene Accounts. **Kein** Bezug zu produktiver Sportstech-Infra,
> kein Gmail/Calendar-Hook, kein Connector zu internen Tools.

## 1. Stack

| Bereich            | Wahl                                              | Begründung                                                  |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------- |
| Sprache            | TypeScript (strict)                               | Shared Types zwischen Server und Web                        |
| Frontend           | Next.js 14 (App Router) + React 18 + Tailwind     | Routing, SSR-fähig, schnelles UI-Iterieren                  |
| Backend            | Node.js 20 + Express + Socket.IO                  | Event-orientiertes Pokerspiel mit Reconnect                 |
| Datenbank          | PostgreSQL (Supabase oder Neon, beides bare SQL)  | Relational, transaktional für Chip-Bewegungen               |
| Auth               | Eigenes Session-Schema (Player-ID + signed token) | Kein OAuth, keine externen Accounts                         |
| Hosting (Web)      | Vercel oder Render                                | Standalone-Account, NICHT das Arbeitskonto                  |
| Hosting (Server)   | Render / Railway / Fly.io                         | Long-lived WS-Connections, kein Serverless                  |
| Realtime           | Socket.IO mit Rooms (`table:<id>`, `lobby`)       | Acks, Reconnect, Namespaces                                 |
| Paket-Manager      | pnpm Workspaces                                   | Monorepo mit `apps/*` und `packages/*`                      |

## 2. Top-Level-Layout

```
neon-poker/
├── apps/
│   ├── server/        Node.js + Socket.IO. Spielzustand. Engine. DB-Zugriff.
│   └── web/           Next.js. UI. KEIN Spielzustand außer Pure-View.
├── packages/
│   └── shared/        TypeScript-Types + Event-Schema (Server ↔ Client)
└── docs/              MVP, Datenmodell, Events, Admin-Spezifikation
```

## 3. Trust Boundary

```
+--------- Browser ---------+        +---------- Server ----------+
| UI, Eingaben               |  WS   | Engine, Karten, Pot, RNG    |
| Sichtbare State-Snapshots ◀┼──────▶| Wahrheit für ALLES           |
| keine Hole Cards anderer  |        | sendet pro Spieler personali- |
| keine eigenen Berechnungen|        | sierten View                 |
+----------------------------+        +-----------------------------+
```

**Goldene Regel:** der Client erfährt **niemals** die Hole Cards eines anderen
Spielers, bevor der Showdown erreicht ist. Auch nicht in DevTools, auch nicht
verschlüsselt. Der Server schneidet vor dem Senden personalisiert.

## 4. Anti-Cheat-Grundlagen (MVP)

1. **Server-only RNG:** `crypto.randomInt` für Shuffle. Deck wird nie an
   Clients geschickt. Pro Hand wird der Initial-Seed in `hand_log` gespeichert
   (für Post-Mortem-Audits, nicht für die Engine).
2. **Action-Validierung:** Jede `player:action` wird gegen den aktuellen
   Server-State geprüft (Turn? Legal? Genug Chips?). Inkonsistente Aktionen
   werden verworfen + geloggt.
3. **Rate-Limits:** Pro Socket max. 10 Actions / Sekunde, max. 60 Chat-
   Messages / Minute.
4. **Idempotenz:** Jede Aktion hat eine `clientActionId`. Server verwirft
   Duplikate (Reconnect-Schutz).
5. **Audit-Log:** Alle Admin-Eingriffe (Chip, Approve, Ban) → `admin_log`
   inkl. Begründung.
6. **Session-Binding:** Token enthält `playerId + sessionId`. Zwei aktive
   Sessions pro Player-ID nur erlaubt, wenn Admin `allow_concurrent_sessions`
   gesetzt hat.

## 5. Rollen

| Rolle             | Was erlaubt                                                          |
| ----------------- | -------------------------------------------------------------------- |
| `admin`           | Approve, Ban, Chips, Tische, Logs einsehen. Karten **nicht**.        |
| `approved_player` | Lobby + Tisch beitreten, spielen, chatten                            |
| `pending_player`  | Sieht Wartebildschirm, keine Tische                                  |
| `banned_player`   | Login wird abgewiesen, alte Sessions invalidiert                     |
| `spectator`       | Optional pro Tisch. Sieht Community Cards, keine Hole Cards          |

## 6. Datenfluss „eine Hand"

```
1. Tisch hat ≥2 ready Spieler → Server startet Hand
2. Server würfelt Deck (server-seitig), speichert hand_id
3. Server verteilt 2 Hole Cards je Spieler → personalisierter snapshot
4. Blinds posten automatisch
5. Pre-Flop:
   for each Spieler in Turn-Order:
     - emit `table:state` (mit Turn-Indicator, ohne fremde Cards)
     - warte auf `player:action` ODER Timer (z.B. 25s)
     - Timeout → Auto-Fold
     - validiere + applizieren + advance
6. Flop, Turn, River nach identischem Muster
7. Showdown:
   - wenn nötig: Hände vergleichen
   - Side-Pots berechnen
   - emit `hand:result` mit allen revealten Cards
   - persistiere hand_log
8. Nächste Hand: Dealer-Button rotiert
```

## 7. Reconnect

- Client merkt sich `sessionToken` in `sessionStorage` (NICHT localStorage —
  schließt Tab schließt Session, Anforderung "ID jedes Mal neu eingeben").
- Bei Disconnect: Server hält Sitzplatz für `RECONNECT_GRACE_MS` (default
  30s) offen, andere sehen "Reconnecting...". Danach Auto-Fold + Sitz frei.
- Reconnect-Auth: `socket.handshake.auth.token` → resolved zu derselben
  `sessionId` → State-Resend.

## 8. Erweiterbarkeit (später)

| Feature           | Schnittpunkt                                                   |
| ----------------- | -------------------------------------------------------------- |
| Turniere          | `tournaments` Tabelle + Blind-Schedules + Eliminationslogik    |
| Rankings          | `player_stats` aggregiert aus `hand_log`                       |
| Private Clubs     | `clubs` mit `club_members`, Tische scoped auf Club             |
| Hand-History      | `hand_log` ist schon da, nur Read-API + UI fehlt               |
| Replays           | `hand_log` enthält actions[] in Reihenfolge → Replay-Player    |

Keine dieser Features ist Teil des MVPs.
