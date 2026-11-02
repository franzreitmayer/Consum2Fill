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

## T-008

- **Erledigt:** Lokale Anmeldung und OIDC mit Keycloak, Rollen, Startbenutzer, Administration für Benutzer und OIDC-Daten, Vertrag, ADR 0004. Geprüft gegen echtes Keycloak 26, in Headless-Chrome bei 360 px und im Produktions-Image. Reviewer hat freigegeben.
- **Aktueller Stand:** Branch `T-008`, Worktree `.worktrees/T-008`, nicht gemergt. `pnpm check` im Container grün.
- **Offene Probleme:** Härtungen in T-009. Startpasswörter sind öffentlich bekannt und müssen vor echtem Betrieb geändert werden. Anlegen, Bearbeiten und Löschen über die Oberfläche nur per Mock-Test geprüft, die API dazu per curl.
- **Nächster konkreter Schritt:** `AUTH_SECRET` in die `.env` des Haupt-Checkouts eintragen, auf `main` `git merge T-008` und `make docker-dev` ausführen.

## T-001

- **Erledigt:** Material, Lagerort, Verbrauch und Bestellung mit Mongoose-Modellen, CRUD-Endpoints unter `/api`, GUID und fortlaufender Nummer, Rollenprüfung, Vertrag, gemeinsame Typen, ADR 0005. Gegen echtes MongoDB per Skript über die API geprüft: gesamter Ablauf, 25 parallele Anlagen, Rennen zwischen Löschen und Anlegen, Neustart des Containers. Das Skript liegt nicht im Repo. Reviewer hat nach einer Korrektur freigegeben.
- **Aktueller Stand:** Branch `T-001`, Worktree `.worktrees/T-001`, nicht gemergt. `make docker-check` grün (API 431 Tests, Web 58 Tests); `make check` auf dem Host nicht ausführbar, weil dort pnpm fehlt. Der Dev-Stack des Worktrees ist gestoppt, seine eigene `.env` und seine Volumes bestehen weiter.
- **Offene Probleme:** Keine Oberfläche für die neuen Daten. Die Rollen, das Löschverbot und die eindeutigen Namen sind Festlegungen aus ADR 0005, nicht aus der Anforderung. Die Mongo-Stores sind automatisch nur mit Mocks getestet, weil `pnpm check` keine Datenbank nutzen darf. Unter `/api/admin` kommt bei kaputtem JSON weiter 400 statt 401 (T-009). `parseEmail` lehnt NUL und einzelne Surrogate nicht ab. Der Vertrag nennt 413 und 415 nicht. Die Sperre schützt nur bei einer App-Instanz.
- **Nächster konkreter Schritt:** Auf `main` `git merge T-001` ausführen.

## T-009

- **Erledigt:** Erzwungene Passwortänderung für Startkonten samt Bildschirm, eigener Passwortwechsel, gemeinsame Sperre für Passwortänderungen und Anmeldung, Limit und Fehlerspeicher für den OIDC-Login, Sicherheitsheader mit `helmet`, Anmeldeprüfung vor dem JSON-Parser unter `/api/admin`, Zeichenprüfung in `parseEmail`, ADR 0006. Geprüft im Produktions-Image mit Chrome bei 360 px und live gegen Rennen beim Passwortwechsel. Reviewer hat nach zwei Korrekturrunden freigegeben.
- **Aktueller Stand:** Branch `T-009`, Worktree `.worktrees/T-009`. `make docker-check` grün (API 557 Tests, Web 75 Tests); `make check` auf dem Host nicht ausführbar, weil dort pnpm fehlt. `main` enthält nur den Stand vor der Korrektur der Rennen (Merge `b05140c`).
- **Offene Probleme:** OIDC mit echtem Provider nicht durchlaufen. Die Sperre hat kein Zeitlimit. Wird ein Benutzer während eines Updates gelöscht, gibt es vermutlich 500 statt 401 oder 404 (ungeprüft). Weitere Einschränkungen in ADR 0006. Neue Abhängigkeiten erreichen einen laufenden Dev-Container erst nach einem Neustart.
- **Nächster konkreter Schritt:** Auf `main` `git merge T-009` ausführen, damit die Korrektur der Rennen ankommt.
