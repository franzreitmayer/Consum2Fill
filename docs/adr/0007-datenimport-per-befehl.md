# 0007: Datenimport per Befehl

- **Status:** akzeptiert
- **Datum:** 2026-11-02

## Kontext

T-012 verlangt, die Standardliste DIN 13232 einmalig in die Entität Material zu übernehmen, auch in bestehende Datenbanken. Gelöschte oder geänderte Standardmaterialien dürfen dabei nicht zurückkehren.

## Entscheidung

- **Auslöser:** Der Import läuft nur durch `make initial-data` als eigener Prozess im laufenden Container `app`. Der Serverstart importiert nichts. Der Befehl gehört zum ersten Deployment.
- **Einmaligkeit:** Ein Vermerk in der Collection `dataimports`, gesetzt nach dem letzten Datensatz, verhindert einen zweiten Lauf. Bis dahin setzt ein erneuter Aufruf einen abgebrochenen Lauf fort.
- **Vorhandene Daten:** Materialien mit exakt gleichem Namen bleiben unverändert und zählen als übersprungen.
- **Datei:** Die CSV liegt unter `resources/data` und wird als Argument übergeben. `.dockerignore` lässt von `resources` nur dieses Verzeichnis ins Image. Sie wird vollständig geprüft, bevor der erste Datensatz geschrieben wird.
- **Werte:** Einheit `Stück`, Schlagwort `DIN 13232`. Es gibt keine neue Abhängigkeit, der Parser gehört zum Repo.

## Konsequenzen

Wird `make initial-data` vergessen, bleibt die Liste leer, ohne dass die Anwendung darauf hinweist. Eine geänderte CSV wird nicht nachgezogen, dafür wäre ein neuer Import mit eigenem Vermerk nötig. Der Import läuft außerhalb der Sperre des Servers und verlässt sich auf den eindeutigen Namensindex und den atomaren Zähler; bei einem gleichzeitig angelegten gleichnamigen Material zählt der Datensatz als übersprungen.
