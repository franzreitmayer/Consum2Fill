# Backlog

Reihenfolge nach Priorität. Der Status steht nur in der jeweiligen Task-Datei. Zum Einplanen `tasks/TEMPLATE.md` nach `tasks/T-<id>.md` kopieren.

1. T-001: Fachliche Anforderungen und Domänenmodell festlegen (Verbrauch, Bestand, Nachfüllen); Ergebnis als ADR und Erweiterung von `docs/api/openapi.yaml`
2. T-002: Lizenzprüfung automatisieren, die Abhängigkeiten gegen die Allowlist in `docs/conventions.md` prüft
3. T-003: Eigenen MongoDB-Benutzer mit eingeschränkten Rechten statt des Root-Benutzers für die Anwendung einrichten
4. T-004: Prüfen, ob die Implementierung `docs/api/openapi.yaml` entspricht, und das in `make check` aufnehmen
5. T-005: Anwendung als PWA installierbar machen, falls die Fachanforderungen es verlangen
6. T-006: Entwicklung und Debugging im Docker-Container
7. T-007: `.claude`-Commands, -Agents und den Format-Hook auf Hosts ohne pnpm nutzbar machen (`make docker-check`, Prettier im Container)
8. T-008: Anmeldung und Authentifizierung
