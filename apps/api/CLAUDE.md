# apps/api

Express 5 und Mongoose 9. Liefert in Produktion auch das gebaute Frontend aus.

- `src/app.ts` baut die App über `createApp()` ohne `listen()` und ohne DB-Verbindung. Abhängigkeiten werden übergeben, damit Tests sie ersetzen können.
- `src/server.ts` ist der einzige Einstiegspunkt mit Nebenwirkungen (DB-Verbindung, Port, Signale).
- Konfiguration nur über `src/config.ts` lesen, nicht direkt aus `process.env`.
- Alle Routen liegen unter `/api` und entsprechen `docs/api/openapi.yaml`. Pfade und Antworttypen kommen aus `@c2r/shared`.
- Mongoose-Modelle liegen in `src/models/`, Schemas sind strikt und Validierung gehört ins Schema.
- Tests nutzen Supertest gegen `createApp()` und liegen als `*.test.ts` neben dem Code. Keine echte Datenbank in `pnpm test`.
- Imports zwischen eigenen Dateien enden auf `.js`.
