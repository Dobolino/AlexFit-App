# AlexFit Web Push

Der Worker ergänzt die statische PWA um echte, verschlüsselte Web-Push-Nachrichten. Pro verbundenem Gerät speichert ein SQLite Durable Object die Push-Subscription, einen Hash des Gerätegeheimnisses, Erinnerungseinstellungen und optionale Timertermine. Trainingswerte, Fotos und vollständige Trainingshistorien werden nicht an diesen Dienst übertragen.

## Bereitstellung

Das Repository enthält einen automatischen Deployment-Workflow. Cloudflare-Zugriff wird dort als GitHub-Actions-Secret `CLOUDFLARE_API_TOKEN` hinterlegt; niemals im JavaScript oder im Repository. Der Workflow erzeugt die VAPID-Schlüssel einmalig und speichert den privaten Schlüssel als Worker-Secret. Bei späteren Deployments bleibt das Schlüsselpaar erhalten. Der öffentliche Schlüssel darf an die PWA ausgeliefert werden.

Die Worker-Konfiguration benötigt `ALLOWED_ORIGIN`, `APP_URL`, `VAPID_SUBJECT` und den SHA-256-Hash eines zufälligen Verbindungscodes (`PAIRING_CODE_HASH`). Der eigentliche Verbindungscode wird getrennt übergeben und niemals im Repository oder in normalen Logs veröffentlicht. Alternativ ist ein Worker-Secret `PAIRING_CODE` möglich. Vor vollständiger Konfiguration beantwortet `/v1/config` Anfragen mit 503.

`npm ci`, `npm test` und `npm run deploy` sind die lokalen Befehle. Wrangler verwendet die Migration `new_sqlite_classes = ["PushDevice"]`; kein manuelles Datenbankschema ist nötig. Der Account muss Workers mit SQLite Durable Objects unterstützen.

## API

Alle Geräteoperationen benötigen `Authorization: Bearer <32 zufällige Bytes als base64url>` und den erlaubten Origin. Die PWA erzeugt dieses Geheimnis selbst. Es wird nur als SHA-256-Hash gespeichert. Der Verbindungscode wird nur bei der ersten Registrierung eines Geräts geprüft und gewährt keinen Zugriff auf bereits registrierte Geräte.

- `GET /v1/config`: öffentlicher VAPID-Schlüssel und Bereitschaft.
- `PUT /v1/devices/{uuid}`: Subscription, erste Kopplung und Einstellungen speichern.
- `GET /v1/devices/{uuid}`: gespeicherten Verbindungsstatus und Einstellungen lesen.
- `PATCH /v1/devices/{uuid}/schedule`: Erinnerung oder Timerhinweise ändern.
- `PUT /v1/devices/{uuid}/timers/rest|cardio`: anstehende Termine mit monotoner Revision ersetzen. Eine leere Terminliste bricht die Hinweise ab; verspätete ältere Revisionen werden ignoriert.
- `POST /v1/devices/{uuid}/test`: Testnachricht, höchstens ein Versuch je 30 Sekunden.
- `DELETE /v1/devices/{uuid}`: gespeicherte Geräteeinstellungen und Termine löschen.

Zeitangaben für Erinnerungen verwenden IANA-Zeitzonen und Wochentage 1–7 (Montag–Sonntag). Sommerzeit wird berücksichtigt. Bei einer fehlenden Uhrzeit im Frühjahr verschiebt sich die Erinnerung um die Zeitlücke nach vorn; bei einer doppelten Uhrzeit im Herbst wird sie nur einmal gesendet.

## Verhalten und Grenzen

Der Server plant Durable-Object-Alarme, sodass die PWA nicht geöffnet bleiben muss. Web Push benötigt eine Internetverbindung. Zustellung und Mitteilungston hängen zusätzlich von iOS, Fokus und Berechtigungen ab; Pausen-/Intervallhinweise sind keine sekundengenauen Wecker. Mehrere verspätete Cardio-Phasen werden auf die zuletzt fällige Phase zusammengefasst. Timer über 60 Sekunden Verspätung werden serverseitig verworfen; Trainingserinnerungen haben 15 Minuten Kulanz. Ein vor dem Netzwerkversuch gespeicherter Zustellanspruch verhindert doppelte Nachrichten nach Alarmwiederholungen. Ein fehlgeschlagener Netzwerkversuch kann daher eine einzelne Nachricht verlieren.

Push-Endpunkte sind auf HTTPS-Adressen bekannter Browser-Pushdienste beschränkt. Weiterleitungen werden nicht verfolgt. Gelöschte oder abgelaufene Subscriptions (404/410) stoppen weitere Zustellungen. Endpunkte und private Schlüssel werden nicht geloggt. Bei Entfernen einer PWA kann der Browser nicht zuverlässig einen Abmeldeaufruf senden; die nächste 404/410-Antwort bereinigt ausstehende Termine.
