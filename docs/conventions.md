# Konventionen

## Code

- TypeScript strict, kein `any` ohne begründenden Kommentar.
- Code, Bezeichner und Code-Kommentare auf Englisch; Oberflächentexte und Dokumentation auf Deutsch.
- Formatierung macht Prettier, im Editor über den Hook und in der Prüfung über `pnpm lint`.
- Dateinamen: React-Komponenten in `PascalCase.tsx`, alles andere in `camelCase.ts`.
- Benannte Exporte statt Default-Exporte, außer wo ein Tool es verlangt.

## Tests

- Tests liegen als `*.test.ts(x)` neben dem Code.
- Zu jedem neuen Verhalten gehört ein Test, zu jedem Bugfix ein Test, der den Fehler zeigt.
- `pnpm test` braucht keine Datenbank, keine festen Ports und kein Netzwerk.

## Git

- Branch je Task: `T-<id>`. `main` bleibt grün.
- Commit-Nachricht: `T-<id>: <was sich ändert>`; ohne Task eine kurze Beschreibung.
- Vor dem Merge: `make check` grün und Freigabe durch den `reviewer`.
- Nicht force-pushen und die Historie von `main` nicht umschreiben.

## API

- `docs/api/openapi.yaml` wird zuerst geändert, danach `packages/shared`, dann Backend und Frontend.
- Alle Routen liegen unter `/api`.
- Fehlerantworten haben die Form `{ "message": "..." }`.

## Mobile-First

- Layouts entstehen zuerst für 360 px Breite; größere Breakpoints erweitern nur.
- Bedienelemente sind mindestens 48 x 48 px groß, keine Funktion hängt an Hover.
- Eingabefelder lösen die passende Bildschirmtastatur aus.
- Lade- und Fehlerzustände sind sichtbar, weil mobile Verbindungen abbrechen.
- Abhängigkeiten im Frontend bewusst wählen: Jedes Paket kostet Ladezeit auf dem Smartphone.

## Lizenzen

Alle Komponenten müssen kostenlos nutzbar sein. Erlaubt für npm-Abhängigkeiten sind MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, MPL-2.0, BlueOak-1.0.0, CC0-1.0 und für Schriften OFL-1.1.

Vor jeder neuen Abhängigkeit die Lizenz prüfen: `npm view <paket> license`. Andere Lizenzen brauchen ein ADR. Die Ausnahme für MongoDB (SSPL) steht in `docs/adr/0002-stack.md`.

## Entscheidungen

Entscheidungen, die schwer rückgängig zu machen sind oder mehrere Bereiche betreffen, werden als ADR aus `docs/adr/TEMPLATE.md` festgehalten.
