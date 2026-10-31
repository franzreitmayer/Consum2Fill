# 0001: Architekturentscheidungen festhalten

- **Status:** akzeptiert
- **Datum:** 2026-10-31

## Kontext

Mehrere Agents arbeiten parallel und in getrennten Sessions an diesem Projekt. Begründungen, die nur im Chat stehen, gehen verloren, und spätere Sessions stellen Entscheidungen dann erneut infrage.

## Entscheidung

Wichtige Architekturentscheidungen werden als fortlaufend nummerierte Dateien in `docs/adr/` festgehalten, auf Basis von `TEMPLATE.md`. Akzeptierte ADRs werden nicht umgeschrieben. Ändert sich eine Entscheidung, ersetzt ein neues ADR das alte und das alte bekommt den Status `ersetzt durch NNNN`.

## Konsequenzen

Jede Session kann Entscheidungen samt Begründung nachlesen. Dafür kostet jede größere Entscheidung einen kurzen zusätzlichen Schreibschritt.
