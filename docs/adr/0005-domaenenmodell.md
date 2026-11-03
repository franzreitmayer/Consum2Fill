# 0005: Domänenmodell

- **Status:** akzeptiert
- **Datum:** 2026-11-02

## Kontext

T-001 verlangt Material, Lagerort, Verbrauch und Bestellung als Datenbankabbildung mit CRUD-Endpoints. Jeder Datensatz hat einen fortlaufenden Schlüssel und eine GUID. Rollen, Löschverhalten, Mengenformat und die Eindeutigkeit von Namen legt die Anforderung nicht fest.

## Entscheidung

- **Schlüssel:** Die GUID ist `_id` in MongoDB und `id` in der API, sie dient in URLs und Verweisen als Schlüssel. Daneben vergibt der Server je Entität eine fortlaufende `number` über einen atomaren Zähler in einer eigenen Collection. Sie ist unveränderlich und wird nicht wiederverwendet.
- **Rollen:** Material, Lagerort und Verbrauch lesen alle Angemeldeten. Material und Lagerort schreiben nur ADMIN und MANAGER. Verbrauch anlegen dürfen alle Angemeldeten; ändern und löschen dürfen ADMIN und MANAGER alle Einträge, USER nur eigene. Bestellungen lesen und schreiben nur ADMIN und MANAGER, USER bekommen auch beim Lesen 403 (T-014).
- **Erfasst von:** Der Server setzt `createdBy` bei Verbrauch und Bestellung beim Anlegen aus der Sitzung, mit Benutzer-ID und Anzeigenamen. Der Name wird mitgespeichert, damit er das Löschen des Benutzers überdauert und auch USER ihn ohne Benutzerverwaltung sehen. Ältere Einträge haben `createdBy: null`; ältere Verbräuche dürfen nur ADMIN und MANAGER ändern oder löschen.
- **Bestellen aus Verbrauch:** `POST /api/orders/from-consumptions` legt eine Bestellung aus einem oder mehreren Verbräuchen mit gleichem Lagerort und Material an und löscht diese Verbräuche. Die Bestellung hält in `requestedBy` Nummer und `createdBy` jedes übernommenen Verbrauchs fest, damit nicht verloren geht, wer den Bedarf gemeldet hat. Der Client schickt zu jedem Verbrauch den gelesenen `updatedAt`; weicht er ab, antwortet die API mit 409, fehlt der Verbrauch, mit 404, und nichts ändert sich. Ohne Replica Set hat MongoDB keine Transaktionen: Der Vorgang läuft unter der Sperre im Prozess, und scheitert das Löschen eines Verbrauchs, werden die schon gelöschten wieder angelegt und die Bestellung entfernt.
- **Geliefert:** `POST /api/orders/{id}/delivered` entfernt die Bestellung wie das Löschen. Der eigene Endpoint hält beide Vorgänge getrennt, damit eine spätere Bestandsführung nur auf „geliefert“ reagiert.
- **Bedarf:** „Bedarf“ ist nur ein anderer Name für Verbrauch, auch angefordertes Material wird als Verbrauch gespeichert. Beides lässt sich in den Daten nicht unterscheiden.
- **Verweise:** Verbrauch und Bestellung verweisen per GUID auf Lagerort und Material. Unbekannte Verweise lehnt die API ab (400), verwendete Stammsätze lassen sich nicht löschen (409).
- **Menge:** Eine Zahl größer 0, Dezimalwerte sind erlaubt, weil die Mengeneinheit auch Liter oder Meter sein kann.
- **Namen:** Material- und Lagerortnamen sind je Entität eindeutig, Groß- und Kleinschreibung zählt. Die Mengeneinheit ist Freitext, ohne Angabe `Stück`. Solange ein Verbrauch oder eine Bestellung auf das Material verweist, ist sie nicht änderbar (409), sonst änderte sich die Bedeutung vorhandener Mengen. Der Name bleibt änderbar.
- **Beschreibung und Schlagworte:** Material hat eine optionale Beschreibung (höchstens 2000 Zeichen) und eine Liste von Schlagworten (höchstens 20 mit je 50 Zeichen). Dubletten fallen ohne Rücksicht auf Groß- und Kleinschreibung weg, die erste Schreibweise bleibt. Ältere Datensätze ohne diese Felder liefern eine leere Beschreibung und eine leere Liste.
- **Suche:** Die Volltextsuche über Material läuft im Browser über die geladene Liste. Die API liefert ohnehin alle Datensätze, und ein Textindex von MongoDB fände keine Wortteile.
- **Zeitstempel:** Die API liefert `createdAt` und `updatedAt`, damit sich ein Verbrauch zeitlich einordnen lässt.

## Konsequenzen

Die Nummern können Lücken haben, etwa wenn ein Anlegen an einem doppelten Namen scheitert oder ein Datensatz gelöscht wird.

Die Prüfung der Verweise und das Schreiben laufen über eine Sperre im Prozess. Das schützt wie in ADR 0004 nur bei einer einzelnen App-Instanz; MongoDB selbst kennt hier keine Fremdschlüssel.

Bestand, Bestellstatus und die Verrechnung von Verbrauch und Bestellung gehören nicht zu diesem Modell. Die Listen haben keine Paginierung und werden mit wachsendem Datenbestand größer. Bei sehr vielen Materialien müsste auch die Suche auf den Server wandern. Eine Oberfläche gibt es für Lagerorte, Material, Verbrauch und Bestellung (T-010, T-011, T-013, T-014).

Die Rücknahme beim Bestellen aus Verbrauch hilft nur bei Fehlern, die die Anwendung selbst bemerkt. Stürzt der Prozess mitten im Vorgang ab, kann eine Bestellung neben noch vorhandenen Verbräuchen stehen. Ein wieder angelegter Verbrauch behält GUID, Nummer, `createdBy` und `createdAt`.
