# Socket-Event-Vertrag

Alle Events sind in `packages/shared/src/events.ts` als TypeScript-Types
zentral definiert. Server und Client importieren von dort, damit nichts
auseinanderläuft.

## Convention

- `client:*` → Browser sendet, Server empfängt
- `server:*` → Server pusht, Browser empfängt
- Ack-basierte Calls werden in `events.ts` als `Ack<T>`-Pattern getypt

## Verbindung

```
Client connect → handshake.auth = { token }
Server:
  - kein Token  → 'auth:required'       (HTTP-Auth-Flow muss laufen)
  - bad Token   → disconnect
  - pending     → 'server:pending'      (warte auf Admin)
  - banned      → 'server:banned' + disconnect
  - approved    → 'server:hello' + initial state
```

## Lobby

| Event                       | Richtung | Payload                                  |
| --------------------------- | -------- | ---------------------------------------- |
| `client:lobby:list`         | →        | (ack) liefert Tische                     |
| `client:lobby:join`         | →        | `{ tableId }` → `Ack<{ ok, error? }>`    |
| `server:lobby:tables`       | ←        | `{ tables: TableSummary[] }`             |

## Tisch

| Event                       | Richtung | Payload                                                                       |
| --------------------------- | -------- | ----------------------------------------------------------------------------- |
| `client:table:sit`          | →        | `{ tableId, seatIndex }` ack                                                  |
| `client:table:leave`        | →        | `{ tableId }`                                                                 |
| `client:table:action`       | →        | `{ tableId, action, amount?, clientActionId }` ack                            |
| `client:table:chat`         | →        | `{ tableId, body }`                                                           |
| `server:table:state`        | ←        | personalisierter `PublicTableState` (eigene Hole Cards sichtbar, andere nicht) |
| `server:table:hand:start`   | ←        | `{ handId, handNumber, buttonSeat, blinds }`                                  |
| `server:table:deal`         | ←        | `{ phase, board?, yourHoleCards? }`                                           |
| `server:table:turn`         | ←        | `{ seatIndex, deadline, legalActions }`                                       |
| `server:table:action`       | ←        | broadcast einer applizierten Aktion `{ seat, action, amount, potAfter }`     |
| `server:table:hand:result`  | ←        | `{ winners, sidePots, revealed[]={seat,holeCards,best} }`                    |
| `server:table:chat`         | ←        | `{ from, body, at }`                                                          |
| `server:table:error`        | ←        | `{ code, message }` (illegal action o.ä.)                                    |

## Admin-Live-Updates

Admin-Aktionen sind primär HTTP (siehe `docs/ADMIN.md`), aber das Frontend
für den betroffenen Spieler bekommt push:

| Event                           | Richtung | Payload                              |
| ------------------------------- | -------- | ------------------------------------ |
| `server:account:approved`       | ←        | `{ chips }`                          |
| `server:account:banned`         | ←        | `{ reason }`                         |
| `server:account:chip_update`    | ←        | `{ chips, delta, reason }`           |
| `server:account:session_revoked`| ←        | `{ reason }` (dann disconnect)       |

## Ack-Pattern

```ts
socket.emit('client:table:action',
  { tableId, action: 'raise', amount: 200, clientActionId: 'a1' },
  (ack: { ok: true } | { ok: false; error: string }) => { ... }
);
```

Der Server muss **immer** acken (Erfolg oder Fehlercode). Kein Ack innerhalb
3s → Client zeigt "Verbindung instabil" und versucht reconnect.

## Idempotenz

`clientActionId` ist eine vom Client generierte ULID. Server merkt sich pro
Hand bereits gesehene IDs (`Set<string>`). Duplikate → ack mit
`{ ok: true, deduped: true }`. Damit überlebt jede Action einen Reconnect-
Mid-Send.
