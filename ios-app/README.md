# AlexFit fürs iPhone · Sideload-Testversion

Diese separate App-Kopie basiert auf dem Webstand `728e737` vom 15.11.2026. `main` und GitHub Pages werden dadurch nicht verändert. Der Quellcode und der macOS-Build liegen ausschliesslich auf `ios/sideload-20261116`.

## Installieren

Die Datei `AlexFit-1.0.0-unsigned.ipa` enthält eine echte, für arm64-iPhones gebaute App. Sie ist absichtlich noch nicht für ein bestimmtes Apple-Konto oder Gerät signiert. Zum Installieren muss beispielsweise **Sideloadly** (Windows/macOS) oder **AltStore** sie mit deinem Apple-Konto signieren. Die IPA direkt auszuwählen und anzutippen installiert sie nicht. Bei einem kostenlosen Apple-Konto muss die Signatur üblicherweise alle sieben Tage erneuert werden. Falls iOS es verlangt, Entwicklermodus aktivieren und dem Entwicklerprofil in den Einstellungen vertrauen. Apple-Zugangsdaten nur im gewählten Sideload-Programm eingeben.

1. Vorher in der bisherigen Safari/Web-App unter Einstellungen ein vollständiges **JSON-Backup** exportieren und in Dateien sichern.
2. Die IPA mit deinem Sideload-Programm signieren und installieren.
3. In AlexFit auf dem iPhone das JSON-Backup über die vorhandene Importfunktion auswählen. Safari und die iPhone-App haben getrennte Datenspeicher.
4. Vor einem späteren Neuinstallieren erneut ein Backup sichern. Beim Erneuern dieselbe App-Identität und dasselbe Apple-Konto beibehalten; Löschen der App entfernt deren lokale Daten.

## Verhalten

- Die App-Oberfläche, Trainingspläne, Schriftarten und Muskelgrafiken sind im Paket enthalten und offline verfügbar. Videos und externe Links benötigen Internet.
- Exporte öffnen das native Teilen-Fenster. Dort kannst du „In Dateien sichern“ wählen. Ein abgebrochenes Teilen markiert das JSON-Backup nicht als erledigt.
- Training und Cardio verwenden den Webstand dieser Version. Es gibt keine automatische Aktualisierung von GitHub Pages; eine neue Version benötigt eine neue IPA.
- Haptisches Feedback nutzt das iPhone. Diese erste Testversion bietet keine nativen Erinnerungen oder garantierten Timeralarme bei gesperrtem Bildschirm. iOS kann Web-Timer im Hintergrund anhalten; beim Zurückkehren berechnet die App die Zeit erneut.
- Keine automatische Apple-Health-, GPS-, Rudergerät- oder WalkingPad-Verbindung. Die vorhandenen manuellen Einträge und XML-Exporte bleiben erhalten.
- Keine Trainingsdaten, Apple-Zugangsdaten oder Signierschlüssel sind im Build enthalten.

## Selbst bauen (Mac mit Xcode)

Im Repository zuerst `npm ci && npm test`, dann:

```sh
cd ios-app
npm ci
npm test
npm run prepare:web
npm run ios:add
node scripts/configure-ios.mjs
npm run ios:sync
npm run ipa
```

Ergebnis: `ios-app/dist/AlexFit-1.0.0-unsigned.ipa`. Der gleichnamige GitHub-Actions-Workflow baut auf macOS; der Linux-Arbeitsrechner kann kein echtes iOS-Binary erstellen.

## Lizenzen

Capacitor und die offiziellen Plugins behalten ihre jeweiligen MIT-Lizenzen in den Paketen. Barlow und Barlow Condensed werden mit ihren OFL-Lizenzen gebündelt. Die bereits von der Web-App verwendete `body-muscles`-Bibliothek wird unverändert lokal mit Apache-2.0-Lizenz und NOTICE mitgeliefert.
