---
description: Sichert den Arbeitsstand in PROGRESS.md und der Task-Datei und committet ihn
argument-hint: "[T-<id>] [Status: in_progress|blocked|review|done]"
---

Sichere den Stand so, dass eine neue Session ohne diesen Chat weiterarbeiten kann. Argumente: $ARGUMENTS

1. Bestimme den Task aus dem Argument oder dem Branch-Namen `T-<id>`. Ohne Task nutze den Abschnitt `Allgemein`.
2. Prüfe mit `git status` und `git diff`, was tatsächlich geändert wurde, und führe `make check` aus. Trage das echte Ergebnis ein.
3. Aktualisiere in `PROGRESS.md` nur den Abschnitt `## T-<id>`. Lege ihn an, falls er fehlt, und ändere keine fremden Abschnitte:
   - **Erledigt:** was in dieser Session fertig wurde
   - **Aktueller Stand:** Branch, Worktree, Ergebnis von `make check`
   - **Offene Probleme:** Fehler und ungeklärte Fragen, sonst „keine"
   - **Nächster konkreter Schritt:** genau eine Aktion, mit Datei oder Befehl
4. Setze `status` in `tasks/T-<id>.md`, wenn er sich geändert hat. `done` ist nur erlaubt, wenn `make check` grün ist und der `reviewer` freigegeben hat. Bei rotem Check bleibt der Task `in_progress` oder `blocked`.
5. Committe alle zum Task gehörenden Änderungen auf dem aktuellen Branch: `T-<id>: handoff - <kurze Beschreibung>`. Prüfe vorher, dass keine fremden Dateien oder Secrets dabei sind. Pushe nicht.
6. Nenne zum Schluss den Commit-Hash und den nächsten Schritt.
