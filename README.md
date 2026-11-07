# AlexFit

Persönliche, lokal gespeicherte Fitness-App mit Krafttraining, Cardio, Rekomposition und Wochenplanung. Ernährung wird separat in Yazio geführt. Schweizer Hochdeutsch. Die Laufzeit benötigt keinen Account, API-Schlüssel oder Build-Schritt.

## Starten

Die Dateien über einen lokalen Webserver oder statisches HTTPS-Hosting ausliefern. Das gesamte Repository ausliefern: Neben index.html gehören alle lokalen JS-/CSS-Dateien, JSON-Dateien, sw.js, manifest.webmanifest und icons/ dazu.

Mit Node.js 24:

    npm ci
    npm start

Anschliessend http://127.0.0.1:8778 öffnen. Für eine installierbare App auf dem Handy HTTPS verwenden. Das Repository wird durch einen Pull Request nicht automatisch veröffentlicht.

## Körperdaten (optional)

Gewicht und Ziel haben keine persönlichen Vorgabewerte im veröffentlichten Code. Persönliche Werte werden ausschliesslich lokal eingegeben und gespeichert.

Training und Vorlagen starten ohne Profil-Pflichtformular. Unter Körperdaten lassen sich Gewicht und Körperfett unabhängig von Erfahrung, Trainingszeit oder einer Bestätigungs-Checkbox speichern. Bestehende Berechnungsdaten bleiben als Bestandsdaten erhalten; das frühere Ernährungsformular ist aus der normalen Bedienung entfernt. Ein unbekannter Körperfettanteil wird nicht geraten.

Hantelgewicht direkt pro Satz über die native Auswahl wählen: 2.5, 3.5, 4.5, 5.5, 6.5, 8, 9, 10, 11.5, 13.5, 16, 18, 20.5, 22.5 und 24 kg. Diese Liste wird einmalig auch für bestehende Installationen übernommen und für Steigerungsvorschläge genutzt. Historische oder laufende Lasten ausserhalb der Liste werden nicht gerundet, sondern als «bisher» beibehalten. Körpergewicht und Körperfett werden dadurch nicht verändert.

Die installierte App nutzt für ihren Rahmen die stabile Viewporthöhe (100vh), der normale Browser-Tab weiterhin die dynamische Höhe. Der untere Sicherheitsabstand wird einmalig an der Navigation reserviert, nicht zusätzlich am Inhalt. Darstellung und Systemauswahl müssen auf einem echten iPhone bestätigt werden.

Nackenempfindlichkeit, Übungssperren sowie Beschwerden vor, während, nach und am Folgetag können dokumentiert werden. Sperren gelten auch für Vorlagen, Übungsalternativen und Progression. Neue neurologische Symptome pausieren die Trainingsfreigabe; die App ersetzt keine ärztliche oder physiotherapeutische Beurteilung.

## Training und Fortschritt

### Flexible Woche und Trainingshilfen

- Training → «Heute nicht → verschieben»: einzelner Termin oder diese und folgende Einheiten. Die Wochenplanung zeigt die Standardtage statt einer leeren Erholungswoche. Standard-Cardio folgt bei einer Kettenverschiebung mit, zusätzliche Bike-Einträge bleiben stehen. Nur bereits geplante Termine werden verschoben. Belegte Ziele und absolvierte Einheiten werden nicht überschrieben.
- Samstag/Reserve: bewusste Wahl einer bestehenden Krafteinheit, freiem Cardio oder Erholung. Nachholen über die Verschiebefunktion verhindert doppelte Termine; kein automatischer fünfter Krafttag.
- Vorbelegung aus der letzten Einheit mit derselben Tages-ID und demselben Namen: Gewicht und Wiederholungen, ohne Wochen zu vermischen oder die Last zu steigern. Aktuelle Satzzahl und Zielbereiche bleiben erhalten; zusätzliche frühere Sätze werden nicht automatisch angehängt. Häkchen und RPE bleiben leer, das Quelldatum wird angezeigt.
- «Letzten Satz übernehmen» kopiert den letzten abgeschlossenen Satz einer Übung in den nächsten offenen Satz. Abgeschlossene Sätze bleiben unverändert, RPE wird nicht kopiert.
- Wochenrückblick: protokollierte Einheiten/Minuten, Cardio, Verschiebungen und vergleichbare Laständerungen zur Vorwoche. Kein Misserfolgs-Score wegen verschobener Wochentage. Höheres Gewicht allein ist kein Qualitätsurteil.
- Einstellungen: Versionsnummer und manuelle Updateprüfung. Keine Löschung der Appdaten; vor bestätigtem Neuladen wird der laufende Entwurf gespeichert. Ohne Verbindung ist keine aktuelle Serverversion garantiert; die Release-Auskunft ist als möglicherweise gecacht gekennzeichnet.
- Aufwärm-/Phasenhinweise sind im Training eingeklappt. Ein echter iPhone-Visualtest steht aus.

- Gemeinsame Progressionsberechnung für alle Anzeigen: zwei vollständige Einheiten am oberen Wiederholungsziel, dokumentierte RPE höchstens 8, keine gemeldeten Beschwerden und eine tatsächlich verfügbare Hantelstufe.
- Steigerungen über 10 % werden nicht automatisch vorgeschlagen. Am Ende der Hantelspanne erfolgt keine erfundene Laststeigerung.
- Halteübungen und Rudern erfassen Sekunden. Ruderintervalle wechseln zwischen Belastung und Pause.
- Laufende Einheiten werden dauerhaft zwischengespeichert. Beim Wiederöffnen werden Uhr und Intervallfolge pausiert wiederhergestellt.
- Vier Krafttage: Montag Oberkörper A, Dienstag Unterkörper A, Mittwoch Oberkörper B, Freitag Unterkörper B. Donnerstag und Sonntag frei; Samstag Cardio nach Wahl über den Cardio-Tab, ohne vorgeschriebene Intervalle.
- Zwölf Wochen: Phase 1 Wiedereinstieg (2 Wochen, zwei Arbeitssätze je Übung), Phase 2 Aufbau (4 Wochen), Phase 3 Festigen (6 Wochen, gleicher Umfang wie Phase 2). Stabile Übungen und 60–120 Sekunden übungsabhängige Pausen statt automatisch kürzerer Pausen, Dropsätze oder Muskelversagen. Phasenwechsel bleibt manuell und von Erholung und Technik abhängig.
- Beim ersten Laden der neuen Planversion startet Phase 1 ab diesem Tag. Vorherige Programmeinstellungen inklusive Vorlagen-Zuordnungen und zukünftige primäre Trainingszuordnungen werden unter `coach.trainingPlanArchives` im vollständigen JSON-Backup archiviert. Die Vorlagen selbst, historische Einträge, Bike-/Ruhetagplanung und aktive Trainingsentwürfe bleiben erhalten. Nachfolgende Starts setzen die Phase nicht erneut zurück.
- Wiederkehrende Übungen dürfen an A-/B-Tagen unterschiedliche Zielbereiche und Satzzahlen haben. Neue Historieneinträge speichern dafür `targetReps` und `plannedSets`; Steigerungen prüfen jeweils das Ziel der damaligen Einheit.
- Bei Rekomposition werden Wochenmittel, Umfang und Kraft gemeinsam betrachtet; ein niedrigeres Zielgewicht ist keine Voraussetzung.

Die Trainings-/Bike-Woche lässt sich frei belegen und verschieben. Einheiten bei hoher Belastung an aufeinanderfolgenden Tagen werden zur Prüfung markiert. Erholung bleibt ein geplanter Teil der Woche.

## Oberfläche und Live-Cardio

Vier Tabs mit eigener Akzentfarbe: Heute (Blau), Krafttraining (Violett), Cardio (Türkis) und Fortschritt (Orange). Ernährung und Sonntagskochen sind aus der Navigation entfernt; vorhandene Daten bleiben im JSON-Backup erhalten. Es gibt keine automatische Yazio-Verbindung. Der Fortschrittscheck wertet Gewicht, Bauchumfang, Kraft und Erholung aus und verlangt keine doppelten Ernährungseinträge.

Im Krafttraining steht der aktuelle Satz im Mittelpunkt. Gewichte verwenden die eigenen Hantelstufen; Wiederholungen lassen sich aus 1–50 wählen oder über «Andere Zahl» als positive ganze Zahl eingeben. Video- und Muskel-Symbole öffnen Details. Der vollständige Ablauf enthält alle Übungen und Sätze, einschliesslich bearbeitbarer erledigter Sätze. «+ Satz» ergänzt die aktuelle Einheit; Änderungen lassen sich nach Trainingsabschluss als Standardplan speichern. Vorhandene Lasten und Übungssperren bleiben berücksichtigt.

Cardio bietet freies Zeittraining und konfigurierbare Intervalle mit Ringtimer. Pause/Fortsetzen, Phase überspringen und Beenden ändern nur die laufende Cardio-Einheit. Einträge entstehen erst über «Aktivität speichern»; Distanz und Puls werden nicht erfunden. Trainingszeit schliesst manuelle Unterbrechungen aus und enthält die Erholung zwischen Intervallen. Ohne laufende App ist kein akustischer Alarm garantiert. Nach einem Seitenneustart wird die zuletzt gespeicherte Live-Einheit pausiert wiederhergestellt. Das bisherige Formular samt Verlauf bleibt unter «Aktivität nachtragen» erreichbar.

## Daten, Backups und Offline-Betrieb

Bestehende Schlüssel für Training, Gewicht, Cardio, Fotos und Vorlagen bleiben erhalten. Neue Coaching-Daten liegen unter af_coach. JSON-Backups enthalten auch diese Daten und den laufenden Trainingsentwurf. Alte Backups können weiterhin importiert werden. CSV und Apple-Health-XML sind Teilauszüge und setzen den Status eines vollständigen Backups nicht mehr zurück.

Der Service Worker speichert alle lokalen Laufzeitdateien und aktualisiert die Offline-Kopie nach erfolgreichen Onlineabrufen. Ein neuer Cache wird erst aktiviert, wenn alle Dateien gespeichert sind.

Benachrichtigungen werden auf Mobilgeräten über den Service Worker angezeigt. Der lokale Erinnerungstimer ist nur bei geöffneter App aktiv. Für Erinnerungen bei geschlossener App eine geplante Woche als ICS in den eigenen Kalender importieren und dort Uhrzeit und Alarm festlegen. Es gibt keinen Push-Server und keine Hintergrundzustellungsgarantie.

## Entwicklung und Tests

    npm ci
    npm test

coach-core.js enthält die Berechnungen, coach.js die bestehende App-Integration. ui-shell.js steuert die Navigation, strength-ui.js die fokussierte Satzansicht und cardio-ui.js den Live-Timer. coach-recipes.js bleibt für Bestandsdaten-Kompatibilität enthalten. Die Tests prüfen Berechnungen, DOM-Abläufe, Bestandsdaten, JSON-Roundtrips, sichere Textdarstellung und den Offline-Cache.

Die automatisierte DOM-Prüfung ersetzt keinen Gerätetest. Installation, Layout, Tastatur, Sperrbildschirm, Audio/Haptik und Benachrichtigungen sollten vor einer Veröffentlichung zusätzlich auf dem Ziel-iPhone/iPad bzw. Android-Gerät geprüft werden.

## Grundlagen

- Mifflin–St Jeor: https://pubmed.ncbi.nlm.nih.gov/2305711/
- ACSM Progressionsgrundlage: https://pubmed.ncbi.nlm.nih.gov/19204579/
- Aktivitätswerte und MET-Definition: https://pacompendium.com/
- Nackenbeschwerden und Warnzeichen: https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/neck-and-back-problems-and-conditions/neck-problems/
- Mobile Benachrichtigungen: https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
