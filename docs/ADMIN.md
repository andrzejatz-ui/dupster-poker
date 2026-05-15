# Admin-Spezifikation

Der Admin verwaltet **Zugang, Spielerstatus, Chips und Räume**. Er hat **keine
Hand am Deck**.

## Login

- `POST /admin/login` { username, password }
- Argon2id-Hashes. Account in `admins`-Tabelle.
- Erfolg → http-only Cookie + admin-scoped JWT (24h).
- Brute-Force: 5 Fehlversuche / IP / 15min → temporäre Sperre.

## HTTP-Endpoints (alle erfordern Admin-JWT)

| Method | Path                              | Wirkung                                                         |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| GET    | `/admin/players`                  | Liste, filterbar nach Status                                    |
| POST   | `/admin/players`                  | `{ playerHandle, displayName }` legt `pending`-Eintrag an       |
| POST   | `/admin/players/:id/approve`      | setzt `status='approved'`, optional `initialChips`              |
| POST   | `/admin/players/:id/reject`       | setzt `status='banned'` ohne `chips`-Initialisierung            |
| POST   | `/admin/players/:id/ban`          | `{ reason }`, revoke alle Sessions                              |
| POST   | `/admin/players/:id/unban`        | nur möglich wenn aktuell `banned`                               |
| POST   | `/admin/players/:id/chips`        | `{ delta, reason, note? }` Atomic Update + Ledger              |
| POST   | `/admin/players/:id/chips/set`    | `{ value, reason, note? }` Absolut, schreibt Ledger als Delta   |
| POST   | `/admin/players/:id/concurrency`  | `{ allow: boolean }`                                            |
| GET    | `/admin/players/:id/sessions`     | aktive Sessions                                                 |
| POST   | `/admin/sessions/:id/revoke`      | kappt eine Session                                              |
| GET    | `/admin/tables`                   | alle Tische inkl. archived                                      |
| POST   | `/admin/tables`                   | `{ name, sb, bb, buyIn, maxPlayers, allowSpectators }`          |
| POST   | `/admin/tables/:id/archive`       | sanft beenden, neue Joins verboten                              |
| GET    | `/admin/ledger`                   | filterable: player, date, reason                                |
| GET    | `/admin/audit`                    | full audit log                                                  |
| GET    | `/admin/hands/:id`                | hand_log inkl. actions                                          |

## Was der Admin **nicht** kann

- Karten sehen, während eine Hand läuft.
- Aktionen erzwingen (kein "fold this player").
- Hole Cards in den hand_results editieren.
- `chip_ledger`-Einträge löschen (nur READ).
- `admin_log`-Einträge editieren (append-only via DB-Trigger).

## UI: Dashboard-Seiten

```
/admin                       Übersicht: counts, kurze Aktivität
/admin/pending               Liste Pending. Approve / Reject je Zeile.
/admin/players               Liste aller. Filter, Chips, Ban-Toggle.
/admin/players/[id]          Detail: Sessions, Ledger, History.
/admin/tables                Liste + Neu-Anlegen-Modal.
/admin/tables/[id]           Aktiver Tisch: Spieler, Pot, Hand-#, Archive.
/admin/audit                 Log-Stream.
```
