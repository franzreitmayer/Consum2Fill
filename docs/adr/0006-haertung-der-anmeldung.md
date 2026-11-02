# 0006: Härtung der Anmeldung

- **Status:** akzeptiert
- **Datum:** 2026-11-02

## Kontext

ADR 0004 hat bewusst Schwächen offen gelassen: Die Startpasswörter sind öffentlich bekannt, `/api/auth/oidc/login` ist unbegrenzt, und die API setzt keine Sicherheitsheader. Unter `/api/admin` läuft außerdem die JSON-Prüfung vor der Anmeldeprüfung. Um Startpasswörter abzulösen, müssen Benutzer ihr Passwort selbst ändern können. ADR 0004 sah das nicht vor und wird in diesem Punkt ersetzt.

## Entscheidung

- **Startpasswörter:** Benutzer haben das Feld `mustChangePassword`. Solange es gesetzt ist, sind nur `/api/auth/me`, `/api/auth/password` und `/api/auth/logout` nutzbar, alle anderen geschützten Routen antworten mit 403. Die Sperre sitzt in der Sitzungsprüfung selbst, die Ausnahmen müssen also ausdrücklich angefordert werden.
- **Bestehende Datenbanken:** Beim Start prüft der Server die drei Startkonten. Gilt noch das Startpasswort, setzt er das Feld, damit auch vorhandene Installationen erfasst werden.
- **Eigenes Passwort:** Lokale Benutzer ändern es unter Angabe des aktuellen. Das neue muss sich unterscheiden. Alle Sitzungen des Benutzers enden, die aktuelle wird neu ausgestellt. Fehlversuche sind je IP begrenzt. Setzt ein Administrator ein Passwort, hebt das die Sperre ebenfalls auf.
- **OIDC-Limit:** `/api/auth/oidc/login` ist je IP begrenzt. Beim Überschreiten leitet die API wie bei jedem Fehler nach `/?loginError=oidc` weiter, weil der Aufruf eine Browsernavigation ist. Fehler beim Abruf der Provider-Daten werden kurz zwischengespeichert, damit ein nicht erreichbarer Provider nicht bei jedem Klick erneut angefragt wird. Eine Änderung der OIDC-Einstellungen leert diesen Speicher.
- **Sicherheitsheader:** `helmet` (MIT) mit einer Content-Security-Policy für das ausgelieferte Frontend. Inline-Styles bleiben erlaubt, weil MUI sie zur Laufzeit erzeugt. `upgrade-insecure-requests` ist abgeschaltet und HSTS nur bei einer `https`-`PUBLIC_URL` aktiv, weil die Anwendung sonst per HTTP im lokalen Netz nicht mehr erreichbar wäre.
- **Reihenfolge:** Unter `/api/admin` laufen Sitzungs- und Rollenprüfung vor dem JSON-Parser, wie bei den Fachdaten in ADR 0005.

## Konsequenzen

Der Erstbenutzer `admin` muss sein Passwort nach der ersten Anmeldung ändern, bevor er etwas anderes tun kann. Die Startpasswörter bleiben damit bekannt, sind aber nur noch zum Ändern des Passworts nutzbar.

**Risiko:** Wer ein Startpasswort vor dem Berechtigten kennt, kann das Konto weiterhin übernehmen, indem er die Änderung zuerst ausführt. Das schließt erst eine Einrichtung ohne Startpasswörter.

Die Limits und der Fehlerspeicher liegen im Prozess und gelten je App-Instanz. Die Prüfung der Startkonten kostet bei jedem Start bis zu drei `scrypt`-Berechnungen.
