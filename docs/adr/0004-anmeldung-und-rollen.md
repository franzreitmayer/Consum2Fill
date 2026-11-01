# 0004: Anmeldung und Rollen

- **Status:** akzeptiert
- **Datum:** 2026-11-01

## Kontext

Die Anwendung soll nur nach einer Anmeldung nutzbar sein, entweder mit einem lokalen Benutzer aus der Datenbank oder über Keycloak per OIDC. Die OIDC-Daten pflegt ein Administrator in der Anwendung, sie liegen also nicht in der Umgebung. Es gibt genau die Rollen ADMIN, MANAGER und USER, jeder Benutzer hat genau eine davon.

## Entscheidung

- **Sitzungen:** Serverseitig in MongoDB, im Cookie `c2r_session` liegt nur ein zufälliges Token, in der Datenbank sein Hash. Das Cookie ist `HttpOnly` und `SameSite=Lax`. JWTs scheiden aus, weil Rollenänderungen und Löschungen sofort wirken sollen.
- **Passwörter:** `scrypt` aus `node:crypto`, keine zusätzliche Abhängigkeit.
- **OIDC:** Authorization Code Flow mit PKCE über `openid-client` (MIT). Keycloak ist ein externer Dienst und kein dritter Container.
- **IAM-Benutzer:** Sie werden bei der ersten Anmeldung angelegt und über das Paar aus Issuer und `sub` wiedererkannt, nie über Benutzername oder E-Mail. Sonst könnte ein Keycloak-Benutzer `admin` das lokale Konto `admin` übernehmen. Neue IAM-Benutzer erhalten die Rolle USER; die Rolle pflegt der Administrator in der Anwendung, Rollen aus Keycloak werden nicht übernommen.
- **Client-Secret:** Mit AES-256-GCM verschlüsselt in der Datenbank, der Schlüssel stammt aus der Pflichtvariable `AUTH_SECRET`. Die API liefert es nie aus, und es geht nur an den Issuer, für den es eingegeben wurde: Bei einer neuen Issuer-URL muss es neu eingegeben werden.
- **Letzter Administrator:** Ein lokaler ADMIN bleibt immer erhalten, damit ein Ausfall des Identity Providers niemanden aussperrt.
- **Startbenutzer:** `admin`, `manager` und `user` mit gleichnamigem Passwort, wie in T-008 verlangt. Sie werden nur angelegt, solange es keinen Benutzer gibt. Das in T-008 kleingeschriebene `manager` als dritter Wert gilt als Rolle MANAGER.
- **Schutz:** Alle Routen verlangen eine Sitzung, außer denen mit `security: []` im Vertrag. Login-Fehlversuche sind je IP begrenzt.

## Konsequenzen

Der Healthcheck bleibt öffentlich, `/api/hello` verlangt jetzt eine Anmeldung. `AUTH_SECRET` muss in jeder `.env` stehen, sonst startet Compose nicht. Wird es geändert, muss das Client-Secret neu eingegeben werden.

**Risiko:** Die Startpasswörter sind öffentlich bekannt und gelten auch im Produktionsbetrieb, bis ein Administrator sie ändert. Der Server warnt beim Anlegen im Log. Ohne TLS-Proxy und `PUBLIC_URL` mit `https` läuft das Sitzungscookie unverschlüsselt über das Netz.

Das ID-Token kommt direkt vom Token-Endpunkt und wird über die Transportverschlüsselung abgesichert, seine Signatur prüft `openid-client` in diesem Ablauf nicht. Eine Issuer-URL mit `http` ist deshalb nur für lokale Tests geeignet. Mit einer `https`-`PUBLIC_URL` vertraut die API einem vorgeschalteten Proxy (`trust proxy`, ein Hop) für die Client-IP; ohne Proxy ließe sich das Login-Limit dann per `X-Forwarded-For` umgehen. Änderungen an Benutzern laufen über eine Sperre im Prozess, damit sich zwei Administratoren nicht gegenseitig entfernen können. Das schützt nur bei einer einzelnen App-Instanz.

Es gibt keine Selbstbedienung beim Passwort, nur Administratoren setzen Passwörter. Beim Abmelden endet nur die Sitzung der Anwendung, nicht die bei Keycloak. Auch das Abschalten von OIDC beendet laufende IAM-Sitzungen nicht, sie gelten bis zu 7 Tage weiter. Ein erneutes Anmelden beendet ältere Sitzungen desselben Benutzers nicht. Im Produktionsbetrieb startet die API nicht mit dem Platzhalter oder einem zu kurzen `AUTH_SECRET`.
