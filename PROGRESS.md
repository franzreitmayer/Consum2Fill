# Fortschritt

Jeder Task pflegt nur seinen eigenen Abschnitt (`## T-<id>`), siehe `/handoff`. Git führt parallele Änderungen an dieser Datei per `merge=union` zusammen. Abschnitte fertiger Tasks werden auf `main` entfernt, sobald sie gemergt sind.

## Allgemein

- **Erledigt:** -
- **Aktueller Stand:** -
- **Offene Probleme:** -
- **Nächster konkreter Schritt:** -

## T-006

- **Erledigt:** Entwicklungsmodus im Container (`docker-compose.dev.yml`, Dockerfile-Stufe `dev`, `make docker-*`), Debug-Konfiguration `.vscode/launch.json`, ADR 0003, Doku. Geprüft: Breakpoint über das Inspector-Protokoll, API-Neustart, HMR über den Vite-WebSocket, Portbindung, Produktions-Image. Befunde des ersten Reviews eingearbeitet.
- **Aktueller Stand:** Branch `T-006`, Worktree `.worktrees/T-006`, nicht gemergt. `pnpm check` im Container grün; `make check` auf dem Host nicht ausführbar, weil dort pnpm fehlt.
- **Offene Probleme:** Reviewer hat noch nicht freigegeben. Offen sind der Breakpoint aus VS Code samt Wiederverbinden und HMR im echten Browser, außerdem die erneute Prüfung nach den Korrekturen. `.claude`-Commands und der Format-Hook setzen weiter pnpm auf dem Host voraus (T-007).
- **Nächster konkreter Schritt:** In `.worktrees/T-006` `make docker-dev` ausführen, in VS Code `.vscode/launch.json` mit `API im Container` starten (Standardports in der `.env` nötig) und einen Breakpoint in `apps/api/src/app.ts` setzen.
