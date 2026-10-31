# 0002: Technologie-Stack

- **Status:** akzeptiert
- **Datum:** 2026-10-31

## Kontext

Vorgaben: TypeScript in Backend und Frontend, MongoDB, Express, Docker Compose mit getrennten Containern für Datenbank und Application Server, ein stabiles UI-Framework, Nutzung vor allem auf dem Smartphone und ausschließlich kostenlose Komponenten.

## Entscheidung

- **Node 24 LTS:** Support bis 04/2028. Node 26 ist erst seit 10/2026 LTS.
- **pnpm-Monorepo:** `apps/web`, `apps/api`, `packages/shared`.
- **Express 5** als Server (Vorgabe), **Mongoose 9** als ODM.
- **MongoDB Community 8.0:** Support bis 10/2029. Version 9.0 ist erst seit 09/2026 verfügbar.
- **React 19, Vite 8, MUI Core 9:** lange erprobt, mit Touch-Komponenten und responsiven Breakpoints. Nur die MIT-lizenzierten Pakete.
- **TypeScript 6.0.x statt 7:** `typescript-eslint` 8.72 verlangt `typescript <6.1.0`.
- **Zwei Container:** `app` liefert API und gebautes Frontend aus, dadurch entfällt CORS.

## Konsequenzen

- **MongoDB ist kostenlos, aber nicht OSI-Open-Source.** Die Community Edition steht unter der SSPL. Der Betrieb für die eigene Anwendung ist kostenlos. Wer MongoDB selbst als Dienst für Dritte anbietet, muss zusätzliche Pflichten erfüllen. Das ist die einzige Ausnahme von der Lizenz-Allowlist in `docs/conventions.md`. Der Treiber und Mongoose stehen unter Apache-2.0 bzw. MIT.
- Entwickler brauchen Node 24 lokal, ältere Versionen scheitern an den `engines`-Angaben der Werkzeuge.
- TypeScript muss aktualisiert werden, sobald `typescript-eslint` Version 7 unterstützt.
