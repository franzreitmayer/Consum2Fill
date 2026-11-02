# Architektur

## Komponenten

| Komponente | Pfad              | Aufgabe                                                          |
| ---------- | ----------------- | ---------------------------------------------------------------- |
| Web        | `apps/web`        | Mobile-first React-Oberfläche, wird zu statischen Dateien gebaut |
| API        | `apps/api`        | Express-Server: REST-API unter `/api`, liefert das Frontend aus  |
| Shared     | `packages/shared` | API-Pfade und Antworttypen für Web und API                       |
| Datenbank  | Container `db`    | MongoDB 8.0, Zugriff nur über Mongoose in `apps/api`             |
| Vertrag    | `docs/api/`       | OpenAPI-Beschreibung, verbindlich für Web und API                |

## Container

```
Smartphone-Browser
       │ HTTP
       ▼
┌─────────────────────────┐        ┌──────────────┐
│ app (node:24-slim)      │        │ db (mongo:8.0)│
│  /api/*  Express-Routen │──────▶ │  Volume       │
│  /*      gebautes Web   │Mongoose│  db-data      │
└─────────────────────────┘        └──────────────┘
```

Es gibt genau zwei Container. Da `app` Frontend und API von derselben Adresse ausliefert, entfällt CORS. Der Datenbankport ist nur auf `127.0.0.1` des Hosts erreichbar.

## Datenfluss

1. Der Browser lädt die statischen Dateien aus `app`. Unbekannte Pfade außerhalb von `/api` liefern `index.html`.
2. Die Oberfläche ruft `/api/*` auf. Pfade und Typen stammen aus `@c2r/shared`.
3. Die Express-Route verarbeitet die Anfrage und nutzt Mongoose-Modelle für den Datenbankzugriff.
4. Die Antwort entspricht `docs/api/openapi.yaml`.

`GET /api/health` meldet den Verbindungsstatus zur Datenbank und ist zugleich der Healthcheck des Containers.

## Anmeldung

Alle Routen außer den öffentlichen im Vertrag verlangen eine Sitzung, `/api/admin/*` zusätzlich die Rolle ADMIN (siehe ADR 0004). Ohne Sitzung zeigt das Frontend den Anmeldebildschirm mit lokaler Anmeldung und, wenn konfiguriert, der Anmeldung über den Identity Provider. Die OIDC-Daten pflegt ein Administrator in der Oberfläche unter „Administration“.

Für Keycloak gilt: Die Issuer-URL muss vom Container `app` und vom Browser unter derselben Adresse erreichbar sein, `localhost` funktioniert deshalb im Container nicht. In Keycloak wird die in der Administration angezeigte Rücksprungadresse eingetragen.

## Entwicklung

Im Container (Standard, siehe ADR 0003): `make docker-dev` startet `db` und `app` mit `docker-compose.dev.yml`. `app` mountet das Repo nach `/repo`, hält `node_modules` in Volumes und startet die API mit `tsx watch` samt Inspector sowie Vite, das `/api` an die API weiterleitet. Das Frontend läuft auf `WEB_PORT` (5173), die API direkt auf `APP_PORT` (3001), der Inspector auf `127.0.0.1:DEBUG_PORT` (9229).

Debugging in VS Code: Startkonfiguration `API im Container`, `Web im Browser` oder beide als `API und Web` aus `.vscode/launch.json`. Sie verwendet fest die Standardports 9229 und 5173. Debuggen lässt sich deshalb nur der Stack, der auf diesen Ports läuft: Laufen mehrere, verbindet sich VS Code auch aus einem anderen Worktree ohne Warnung mit diesem Stack. `restart: true` soll die Verbindung nach einem Neustart durch `tsx watch` wiederherstellen.

Web und API sind auch im Entwicklungsmodus im lokalen Netz erreichbar, damit sich die Oberfläche auf dem Smartphone testen lässt. Nur der Inspector und die Datenbank bleiben auf `127.0.0.1`.

Ohne Container: `docker compose up -d db` startet nur die Datenbank, `pnpm dev` startet API und Vite auf dem Host.

## Parallelbetrieb

Jeder Task läuft in einem eigenen Worktree unter `.worktrees/T-<id>`. `pnpm check` braucht weder Datenbank noch feste Ports und läuft deshalb in mehreren Worktrees gleichzeitig. Compose benennt Container und Volumes nach dem Verzeichnis. Wer es in mehreren Worktrees startet, braucht dort eine eigene `.env` mit anderen Werten für `APP_PORT` und `MONGO_PORT`, im Entwicklungsmodus auch für `WEB_PORT` und `DEBUG_PORT`. Die Volumes eines Worktrees bleiben nach `scripts/remove-worktree.mjs` bestehen; wer sie nicht mehr braucht, entfernt sie vorher im Worktree mit `docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v`. Das löscht auch die Datenbank dieses Projekts.

## Fachlichkeit

Das Domänenmodell besteht aus Material, Lagerort, Verbrauch und Bestellung (siehe ADR 0005). Verbrauch und Bestellung verweisen per GUID auf Lagerort und Material. Die Datensätze haben CRUD-Endpoints unter `/api`. In der Oberfläche pflegen ADMIN und MANAGER Lagerorte und Material unter „Stammdaten“, die Suche über Material läuft im Browser. Für Verbrauch und Bestellung gibt es noch keine Oberfläche. Bestand wird nicht geführt.
