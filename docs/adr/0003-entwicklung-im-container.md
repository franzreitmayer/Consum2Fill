# 0003: Entwicklung und Debugging im Container

- **Status:** akzeptiert
- **Datum:** 2026-11-01

## Kontext

Die Entwicklung lief bisher mit Node und pnpm auf dem Host. Das setzt die passende Node-Version auf jedem Rechner voraus. Die Laufzeit soll stattdessen aus dem Repo kommen, der Editor bleibt auf dem Host. Unter Windows kommen Dateiereignisse aus dem Bind-Mount nicht im Container an, und native Abhängigkeiten unterscheiden sich zwischen Host und Container.

## Entscheidung

- `docker-compose.dev.yml` überlagert `docker-compose.yml` und wird nur explizit geladen (`make docker-dev`). Es bleibt bei den Containern `db` und `app`; `docker compose up --build -d` startet weiter das Produktions-Image.
- Der Dockerfile erhält die Stufe `dev`. Die Produktionsstufe bleibt die letzte und damit der Standard.
- Das Repo wird nach `/repo` gemountet. Jedes `node_modules` liegt in einem benannten Volume, `pnpm install` läuft bei jedem Containerstart.
- Die Watcher von `tsx` und Vite pollen (`CHOKIDAR_USEPOLLING`).
- Der Node-Inspector lauscht im Container auf Port 9229 und ist auf dem Host nur über `127.0.0.1` erreichbar. VS Code hängt sich über `.vscode/launch.json` an.
- Der Editor läuft auf dem Host. Dev Container sind nicht eingerichtet: Das Debugging kommt ohne sie aus, und `git` samt Hooks bleibt auf dem Host.

## Konsequenzen

Auf dem Host genügen Docker, `make` und ein Editor; `pnpm dev` funktioniert weiterhin für alle, die lokal arbeiten. Polling erzeugt etwas Grundlast. Der Dev-Container läuft als root, auf Linux-Hosts können Befehle im Container deshalb Dateien im Repo root zuordnen. Nach `make docker-stop` bleiben die Volumes erhalten; Zugriff auf Abhängigkeiten im Editor (IntelliSense) braucht weiterhin ein `pnpm install` auf dem Host, weil die Volumes dort nicht sichtbar sind.
