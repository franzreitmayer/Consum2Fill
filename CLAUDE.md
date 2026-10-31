# consumption2refill

Mobile-first Web-Anwendung als pnpm-Monorepo. Jeder Projektzustand steht in Dateien im Repo, nichts nur im Chat.

## Session-Regel

Zu Beginn jeder Session PROGRESS.md und den aktiven Task in tasks/ lesen; am Ende PROGRESS.md aktualisieren und committen (`/handoff`).

## Stack

- **Sprache:** TypeScript 6.0 (strict), Node 24 LTS (`.nvmrc`)
- **Frontend (`apps/web`):** React 19, Vite 8, MUI Core 9
- **Backend (`apps/api`):** Express 5, Mongoose 9
- **Gemeinsam (`packages/shared`):** API-Pfade und Antworttypen
- **Datenbank:** MongoDB Community 8.0
- **Betrieb:** Docker Compose mit den Containern `db` und `app`
- **Tests und Qualität:** Vitest, Testing Library, Supertest, ESLint, Prettier

## Befehle

Voraussetzung: `nvm use 24`, `corepack enable`, `pnpm install`.

| Zweck                     | Befehl                                 |
| ------------------------- | -------------------------------------- |
| Alles prüfen              | `make check` (identisch: `pnpm check`) |
| Lint und Formatprüfung    | `pnpm lint`                            |
| Typecheck                 | `pnpm typecheck`                       |
| Tests                     | `pnpm test`                            |
| Nur eine App testen       | `pnpm --filter @c2r/api test`          |
| Formatieren               | `pnpm format`                          |
| Datenbank für Entwicklung | `docker compose up -d db`              |
| Entwicklung               | `pnpm dev`                             |
| Gesamtsystem in Docker    | `docker compose up --build -d`         |

Vor dem ersten Compose-Start `.env.example` nach `.env` kopieren. `pnpm dev` öffnet das Frontend auf Port 5173 und die API auf Port 3001. In Docker läuft beides auf `APP_PORT` (Standard 3001), MongoDB ist auf dem Host über `MONGO_PORT` (Standard 27018) erreichbar.

## Harte Regeln

1. **Definition of Done:** `make check` ist grün. Ein Task ohne grünen Check ist nicht fertig.
2. **API-Vertrag zuerst:** `docs/api/openapi.yaml` ist verbindlich. Erst den Vertrag ändern, dann Backend und Frontend. `packages/shared` folgt dem Vertrag.
3. **Parallelarbeit:** Pro Task ein Worktree `.worktrees/T-<id>` und ein Branch `T-<id>` (`/start-task`). Nicht direkt auf `main` entwickeln.
4. **Pfadgrenzen:** Nur die in der Task-Datei genannten Pfade ändern.
5. **`pnpm check` bleibt unabhängig:** keine laufende Datenbank, keine festen Ports, keine Netzwerkzugriffe in Tests.
6. **Mobile-First:** Jede Oberfläche funktioniert ab 360 px Breite und per Touch.
7. **Lizenzen:** Nur kostenlose Abhängigkeiten mit Lizenzen aus der Allowlist in `docs/conventions.md`. Keine kostenpflichtigen Pakete wie MUI X Pro.
8. **TypeScript bleibt auf 6.0.x,** bis `typescript-eslint` Version 7 unterstützt.
9. **Keine Secrets im Repo.** `.env` ist gitignored, neue Variablen kommen in `.env.example`.
10. **Entscheidungen festhalten:** Architekturentscheidungen als ADR in `docs/adr/`.
11. **Nur eine Stelle für den Status:** Task-Status steht nur in der Task-Datei, `tasks/backlog.md` führt nur die Reihenfolge.

## Agents und Commands

- `backend`: nur `apps/api` und `packages/shared`
- `frontend`: nur `apps/web`
- `reviewer`: liest und führt Tests aus, schreibt keinen Code
- `/start-task T-<id>`: Task belegen, Worktree und Branch anlegen
- `/handoff`: PROGRESS.md und Task-Status aktualisieren, committen

Änderungen außerhalb dieser Pfade (Vertrag, Docs, Wurzelkonfiguration) macht die Haupt-Session.

## Dokumentation

- `docs/architecture.md`: Komponenten und Datenfluss
- `docs/conventions.md`: Code, Tests, Git, Mobile-First, Lizenzen
- `docs/api/openapi.yaml`: Vertrag zwischen Frontend und Backend
- `docs/adr/`: Architekturentscheidungen, Vorlage in `TEMPLATE.md`
- `tasks/`: `backlog.md`, `TEMPLATE.md` und die Task-Dateien
- `PROGRESS.md`: aktueller Stand je Task
