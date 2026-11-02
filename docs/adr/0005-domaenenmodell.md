# 0005: Domänenmodell

- **Status:** akzeptiert
- **Datum:** 2026-11-02

## Kontext

T-001 verlangt Material, Lagerort, Verbrauch und Bestellung als Datenbankabbildung mit CRUD-Endpoints. Jeder Datensatz hat einen fortlaufenden Schlüssel und eine GUID. Rollen, Löschverhalten, Mengenformat und die Eindeutigkeit von Namen legt die Anforderung nicht fest.

## Entscheidung

- **Schlüssel:** Die GUID ist `_id` in MongoDB und `id` in der API, sie dient in URLs und Verweisen als Schlüssel. Daneben vergibt der Server je Entität eine fortlaufende `number` über einen atomaren Zähler in einer eigenen Collection. Sie ist unveränderlich und wird nicht wiederverwendet.
- **Rollen:** Lesen dürfen alle Angemeldeten, Verbrauch schreiben ebenfalls. Material, Lagerort und Bestellung schreiben nur ADMIN und MANAGER.
- **Verweise:** Verbrauch und Bestellung verweisen per GUID auf Lagerort und Material. Unbekannte Verweise lehnt die API ab (400), verwendete Stammsätze lassen sich nicht löschen (409).
- **Menge:** Eine Zahl größer 0, Dezimalwerte sind erlaubt, weil die Mengeneinheit auch Liter oder Meter sein kann.
- **Namen:** Material- und Lagerortnamen sind je Entität eindeutig, Groß- und Kleinschreibung zählt. Die Mengeneinheit ist Freitext, ohne Angabe `Stück`. Solange ein Verbrauch oder eine Bestellung auf das Material verweist, ist sie nicht änderbar (409), sonst änderte sich die Bedeutung vorhandener Mengen. Der Name bleibt änderbar.
- **Beschreibung und Schlagworte:** Material hat eine optionale Beschreibung (höchstens 2000 Zeichen) und eine Liste von Schlagworten (höchstens 20 mit je 50 Zeichen). Dubletten fallen ohne Rücksicht auf Groß- und Kleinschreibung weg, die erste Schreibweise bleibt. Ältere Datensätze ohne diese Felder liefern eine leere Beschreibung und eine leere Liste.
- **Suche:** Die Volltextsuche über Material läuft im Browser über die geladene Liste. Die API liefert ohnehin alle Datensätze, und ein Textindex von MongoDB fände keine Wortteile.
- **Zeitstempel:** Die API liefert `createdAt` und `updatedAt`, damit sich ein Verbrauch zeitlich einordnen lässt.

## Konsequenzen

Die Nummern können Lücken haben, etwa wenn ein Anlegen an einem doppelten Namen scheitert oder ein Datensatz gelöscht wird.

Die Prüfung der Verweise und das Schreiben laufen über eine Sperre im Prozess. Das schützt wie in ADR 0004 nur bei einer einzelnen App-Instanz; MongoDB selbst kennt hier keine Fremdschlüssel.

Bestand, Bestellstatus und die Verrechnung von Verbrauch und Bestellung gehören nicht zu diesem Modell. Die Listen haben keine Paginierung und werden mit wachsendem Datenbestand größer. Bei sehr vielen Materialien müsste auch die Suche auf den Server wandern. Eine Oberfläche folgt in einem eigenen Task.
