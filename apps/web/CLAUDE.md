# apps/web

React 19, Vite 8 und MUI Core 9. Die Hauptnutzung läuft auf dem Smartphone.

- **Mobile-First:** Erst für 360 px Breite bauen, größere Breakpoints erweitern nur (`sx` mit `{ xs: ..., md: ... }`). Kein horizontales Scrollen.
- **Touch:** Bedienelemente mindestens 48 x 48 px (`src/theme.ts`). Keine Funktion darf nur per Hover erreichbar sein.
- **Eingaben:** Passende Typen setzen (`inputMode`, `type="number"` usw.), damit die richtige Bildschirmtastatur erscheint.
- **Nur MIT-Pakete von MUI:** `@mui/material` ja, kostenpflichtige MUI-X-Pro- oder Premium-Pakete nein.
- **Imports:** MUI pfadweise importieren (`@mui/material/Button`), das hält das Bundle klein.
- **API:** Pfade und Typen aus `@c2r/shared`. Lade- und Fehlerzustand immer anzeigen, mobile Netze sind unzuverlässig.
- **Tests:** Testing Library, `fetch` per `vi.stubGlobal` ersetzen, nach sichtbarem Text und Rollen suchen. Dateien als `*.test.tsx` neben dem Code.
- **Sprache:** Oberflächentexte auf Deutsch, Code auf Englisch.
