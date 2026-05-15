# Deployment — Cloud-only Setup

> Du brauchst keinen Admin-Zugang auf deinem Rechner. Alles läuft in
> Browser-Dashboards.
> Drei Services: **Supabase** (DB) + **Render** (Backend) + **Vercel** (Frontend).
> Alle drei haben einen kostenlosen Tier, der für ein MVP ausreicht.

## 1. Voraussetzungen

- Privates GitHub-Konto (NICHT das Arbeits-GitHub).
  Falls noch keins → [github.com](https://github.com/signup) mit privater Email.
- Supabase-Projekt steht schon (siehe Schritte vorher).
- DB-Passwort und SESSION_SECRET sicher gespeichert.

## 2. GitHub: privates Repo anlegen

1. [github.com/new](https://github.com/new) öffnen
2. **Repository name**: `neon-poker`
3. **Visibility**: ✅ Private
4. **Initialize**: alle Häkchen leer lassen (kein README, kein .gitignore — wir
   pushen das selbst)
5. **Create repository**
6. Auf der nächsten Seite die HTTPS-URL des Repos kopieren, z.B.
   `https://github.com/DEIN-USERNAME/neon-poker.git`

Dann hier in der Konsole (ich erledige das):

```powershell
git remote add origin <DIE-URL>
git push -u origin main
```

Beim ersten Push fragt Git Credential Manager nach Login → Browser-Fenster
öffnet sich → mit deinem privaten GitHub einloggen.

## 3. Supabase: Schema einspielen

1. Im Supabase-Dashboard links **SQL Editor** öffnen
2. **+ New query**
3. Den Inhalt von [`apps/server/src/db/schema.sql`](../apps/server/src/db/schema.sql) reinkopieren
4. **Run** drücken (oder Ctrl+Enter)
5. Erwartete Ausgabe: „Success. No rows returned"

Tabellen kontrollieren: links **Table Editor** → die zehn Tabellen
(`players`, `admins`, `sessions`, `tables`, `table_seats`, `hands`,
`hand_actions`, `hand_results`, `chip_ledger`, `chat_messages`, `admin_log`)
müssen alle sichtbar sein.

## 4. Render: Backend deployen (mit Blueprint)

1. [dashboard.render.com](https://dashboard.render.com) → Anmelden mit
   privatem Konto (GitHub-Login geht).
2. Oben rechts **New +** → **Blueprint**.
3. **Connect a repository** → das gerade gepushte `neon-poker` wählen.
   Render erkennt automatisch `render.yaml` und liest die Service-Definition.
4. **Apply** klicken. Render erstellt den Service `neon-poker-server`.
5. **Environment Variables** ausfüllen (die mit `sync: false` markiert sind):

   | Key | Wert |
   |---|---|
   | `DATABASE_URL` | deine Supabase-Connection-URL aus dem vorherigen Schritt (Session pooler!) |
   | `SESSION_SECRET` | 96-Hex-String (frag mich, ich generiere) |
   | `BOOTSTRAP_ADMIN_USERNAME` | `admin` |
   | `BOOTSTRAP_ADMIN_PASSWORD` | dein selbstgewähltes Admin-Passwort |
   | `ALLOWED_ORIGINS` | **erstmal leer lassen** — füllen wir nach dem Vercel-Schritt |

6. **Save** → Render startet den Build (`npm install`). Dauert 2–4 min.
7. Logs verfolgen unter dem Service → Tab **Logs**. Erfolg sieht so aus:
   ```
   neon-poker server up
   bootstrap admin created — change password ASAP
   ```
8. Die öffentliche URL kopieren — sie steht oben im Service-Header und sieht
   so aus: `https://neon-poker-server-XXXX.onrender.com`

### Wichtige Warnung zum Free-Plan

Render Free spindown'd Services nach 15 min Inaktivität. Beim nächsten
Request muss er ~30 sec hochfahren. Während dieser Zeit:

- **Spielzustände in RAM gehen verloren** (wir laden Tische aus der DB neu,
  aber laufende Hände werden abgebrochen).
- Spieler sehen Reconnect-Spinner.

Für ein MVP-Demo OK. Für ernsthaftes Spielen: Render auf paid Plan upgraden
(7$/Monat) oder zu Fly.io / Railway wechseln.

## 5. Vercel: Frontend deployen

1. [vercel.com/new](https://vercel.com/new) → privates Konto, GitHub-Login.
2. **Import Git Repository** → `neon-poker` wählen.
3. **Project Configuration**:

   | Feld | Wert |
   |---|---|
   | Framework Preset | `Next.js` (sollte auto-detected sein) |
   | **Root Directory** | `apps/web` ← **wichtig!** |
   | Build Command | leer lassen (auto: `next build`) |
   | Install Command | `cd ../.. && npm install` ← **wichtig** für die Monorepo-Workspace |
   | Output Directory | leer lassen (auto: `.next`) |

4. **Environment Variables**:

   | Key | Wert |
   |---|---|
   | `NEXT_PUBLIC_SERVER_URL` | Render-URL aus Schritt 4.8, z.B. `https://neon-poker-server-XXXX.onrender.com` |

5. **Deploy** → Vercel baut. Dauert 1–3 min.
6. Bei Erfolg: Live-URL erscheint, z.B. `https://neon-poker-XYZ.vercel.app`

## 6. Render → Vercel-URL eintragen (CORS)

Damit dein Frontend zum Backend reden darf, muss Render die Vercel-Domain
in `ALLOWED_ORIGINS` haben.

1. Render-Dashboard → Service `neon-poker-server` → **Environment**.
2. `ALLOWED_ORIGINS` setzen auf:
   ```
   https://neon-poker-XYZ.vercel.app
   ```
   (deine echte Vercel-URL)
3. **Save Changes** → Service startet automatisch neu (~1 min).

## 7. Smoke-Test

Auf der Vercel-URL:

1. Landing-Page sollte das Neon-Poker-UI zeigen.
2. **Admin-Login** rechts oben → `admin` + dein BOOTSTRAP_ADMIN_PASSWORD.
3. Admin-Dashboard sollte erscheinen, alle vier Karten leer.
4. **+ Neuer Tisch** klicken → Tisch anlegen (z.B. SB=10, BB=20, Buy-in=1000,
   Max=6).
5. In einem **zweiten Browser** (oder Inkognito-Fenster):
   - `/join` → Player-ID `alpha` + Display-Name `Alpha`.
   - Wartet auf Approval.
6. Im Admin-Tab: Pending Approvals → Approve mit 5000 Chips.
7. Im zweiten Browser: refresht automatisch zur Lobby → Tisch beitreten.
8. Im **dritten Browser**: dasselbe mit Player-ID `beta`.
9. Sobald 2 Spieler sitzen, startet die erste Hand automatisch.

## 8. Häufige Fehler & Lösungen

### Render-Logs zeigen `getaddrinfo ENOTFOUND` oder `connect ETIMEDOUT`
→ DATABASE_URL falsch. Stelle sicher: **Session pooler** auf Port 5432
(NICHT Transaction pooler 6543, NICHT Direct connection — letztere ist
IPv6 und in vielen Hosts unerreichbar).

### Render-Logs: `SESSION_SECRET must be ≥32 chars`
→ SESSION_SECRET zu kurz. Generiere neu (siehe unten).

### Vercel-Build schlägt fehl: `Cannot find module '@neon-poker/shared'`
→ Install Command nicht auf `cd ../.. && npm install` gesetzt. In den
Vercel-Project-Settings → Build & Development Settings korrigieren.

### Browser zeigt "Verbinde …" und kommt nicht weiter
→ Wahrscheinlich `ALLOWED_ORIGINS` auf Render fehlt oder die Vercel-URL
ist falsch geschrieben. Im DevTools-Network-Tab nach WS-Errors suchen
(Status 1006 oder CORS-Fehler).

### Render-Server schläft ein
→ Free-Tier-Limit. Workarounds:
- Cron-Job, der alle 14 min `/health` pingt (z.B. via cron-job.org).
- Auf Paid Plan upgraden (~7$/Monat).

## 9. Geheimnisse generieren

```powershell
# SESSION_SECRET (96 Hex-Zeichen)
-join ((1..96) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })

# Oder, wenn du Bash hast (Git-Bash):
openssl rand -hex 48
```

## 10. Updates deployen

Code-Änderungen committen + pushen → Render und Vercel deployen
automatisch. Erste paar Minuten beobachten.

```powershell
git add -A
git commit -m "Update: <was>"
git push
```
