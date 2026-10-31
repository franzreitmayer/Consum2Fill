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

## Entwicklung

`docker compose up -d db` startet nur die Datenbank. `pnpm dev` startet die API mit `tsx watch` und Vite, das `/api` an die API weiterleitet.

## Parallelbetrieb

Jeder Task läuft in einem eigenen Worktree unter `.worktrees/T-<id>`. `pnpm check` braucht weder Datenbank noch feste Ports und läuft deshalb in mehreren Worktrees gleichzeitig. Compose benennt Container und Volumes nach dem Verzeichnis. Wer es in mehreren Worktrees startet, braucht dort eine eigene `.env` mit anderen Werten für `APP_PORT` und `MONGO_PORT`.

## Fachlichkeit

Das Domänenmodell ist noch offen, siehe `tasks/backlog.md`.
