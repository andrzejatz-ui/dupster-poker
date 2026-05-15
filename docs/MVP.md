# MVP Scope

> Was im ersten Wurf existiert und funktioniert — und was bewusst nicht.

## In Scope (V1)

### Auth & Zugang
- Invite-Link führt auf `/join`. Spieler tippt **Player-ID** manuell ein.
- Server prüft: existiert die ID? Ist sie `approved`? Nicht `banned`?
- Spieler ohne Eintrag → `pending`-Status, sieht Wartebildschirm.
- Admin-Login getrennt unter `/admin` mit Admin-Passwort (env, gehashed).

### Lobby
- Liste verfügbarer Tische (Name, Blinds, Buy-in, X/Y Spieler).
- Beitritt nur wenn Chip-Konto ≥ Buy-in.
- Live-Update über Socket (Tisch füllt sich, neuer Tisch entsteht).

### Tisch (Texas Hold'em No-Limit, Cash-Game-Stil)
- 2–9 Spieler.
- Blinds, Dealer-Button, Turn-Timer (default 25s, Auto-Fold bei Ablauf).
- Aktionen: `check`, `bet`, `call`, `raise`, `fold`, `all-in`.
- Pot inkl. **Side-Pots** bei All-Ins.
- Showdown mit Hand-Ranking-Eval, sichtbarer Hand-Vergleich.
- Hand wird in `hand_log` persistiert.
- Chat pro Tisch (max. 280 Zeichen, Rate-Limit).
- Spectator-Toggle pro Tisch (Default: aus).

### Admin-Dashboard
- Pending-Approval-Liste → Approve / Reject.
- Spielerliste → Chips +/-/Set, Ban / Unban, Sessions kappen.
- Tische erstellen mit Buy-in, SB, BB, Max-Players, Spectators ja/nein.
- Audit-Log: alle Admin-Aktionen.

### Chips
- Globaler Chip-Stand pro Spieler.
- Buy-in zieht beim Sitzen Chips ab, schreibt sie als `seat_stack` am Tisch.
- Leave Table: `seat_stack` wird wieder gutgeschrieben.
- Jede Bewegung in `chip_ledger` mit Reason (`admin_grant`, `buy_in`,
  `cash_out`, `win`, `lose`).

### Reconnect
- 30s Grace, Sitz wird gehalten, andere Spieler sehen Status.

## Explizit nicht in V1

- Mehrere Währungen / echtes Geld
- Tournaments
- Achievement-System / Rankings
- Friend-Lists, private DMs
- Mobile-App (nur responsives Web)
- Stake-Variationen wie Pot-Limit Omaha
- 2FA für Admin (kommt in V2)
- Email-Benachrichtigungen
- Replay-Viewer für vergangene Hände

## Done-Definition

V1 ist „fertig", wenn:
1. Zwei Browser können auf zwei Geräten eine vollständige Hand spielen,
   Showdown sehen und Pot korrekt zugeteilt bekommen.
2. Ein dritter Browser kann als Pending joinen, wird vom Admin freigegeben,
   bekommt Chips, betritt den Tisch und spielt mit.
3. Ein Disconnect mitten in der Hand führt zu Auto-Fold nach 30s, nicht
   zum Crash.
4. Admin kann ohne Game-Refresh Chips vergeben und das Player-UI updated
   sich live.
5. Alle Aktionen erscheinen im `hand_log` bzw. `admin_log`.
