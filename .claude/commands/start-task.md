---
description: Übernimmt einen Task und richtet Worktree und Branch T-<id> ein
argument-hint: "T-<id>"
---

Starte den Task $ARGUMENTS. Ohne ID: Stoppe und nenne die offenen Tasks aus `tasks/`.

1. Führe die Schritte 2 bis 4 im Haupt-Checkout auf `main` aus. Lies `PROGRESS.md` und `tasks/$ARGUMENTS.md`.
2. Stoppe mit einer Meldung, wenn:
   - der `status` nicht `todo` ist (der Task ist belegt oder fertig; Ausnahme: `in_progress`, wenn der Worktree schon existiert, dann weiter mit Schritt 6)
   - ein Task aus `blocked_by` nicht `done` ist
   - die `betroffenen Pfade` sich mit einem anderen Task im Status `in_progress` überschneiden
3. Setze in der Task-Datei `status: in_progress` und `owner` auf die Kennung dieser Session.
4. Committe nur diese Datei auf `main`, **bevor** du den Worktree anlegst, damit andere Agents die Belegung sehen: `T-<id>: start`.
5. Lege den Worktree an und installiere die Abhängigkeiten:
   ```
   git worktree add .worktrees/T-<id> -b T-<id>
   pnpm --dir .worktrees/T-<id> install
   ```
6. Arbeite ab jetzt ausschließlich in `.worktrees/T-<id>`. Der Haupt-Checkout bleibt unverändert.
7. Prüfe mit `make check` im Worktree, dass der Ausgangsstand grün ist.
8. Setze die Akzeptanzkriterien um. Delegiere Arbeit, die nur einen Bereich betrifft, an `backend` oder `frontend`. Vertragsänderungen in `docs/api/openapi.yaml` machst du selbst, bevor du delegierst.
9. Lass die Änderungen vom `reviewer` prüfen und beende die Session mit `/handoff`.
