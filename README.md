# AlexFit

Persönliche, lokal gespeicherte Fitness-App mit Krafttraining, Cardio, Rekomposition, Wochenplanung und Sonntagskochen. Schweizer Hochdeutsch. Die Laufzeit benötigt keinen Account, API-Schlüssel oder Build-Schritt.

## Starten

Die Dateien über einen lokalen Webserver oder statisches HTTPS-Hosting ausliefern. Nicht nur index.html herunterladen: coach-core.js, training-plans.js, coach.js, coach-recipes.js, coach.css, recipe-library.json, sw.js, manifest.webmanifest und icons/ gehören dazu.

Mit Node.js 24:

    npm ci
    npm start

Anschliessend http://127.0.0.1:8778 öffnen. Für eine installierbare App auf dem Handy HTTPS verwenden. Das Repository wird durch einen Pull Request nicht automatisch veröffentlicht.

## Körperdaten (optional)

Gewicht und Ziel haben keine persönlichen Vorgabewerte im veröffentlichten Code. Persönliche Werte werden ausschliesslich lokal eingegeben und gespeichert.

Training und Vorlagen starten ohne Profil-Pflichtformular. Unter Körperdaten lassen sich Gewicht und Körperfett unabhängig von Erfahrung, Trainingszeit oder einer Bestätigungs-Checkbox speichern. Bestehende Berechnungsdaten bleiben erhalten; zusätzliche Angaben für die Energieformel sind separat und optional eingeklappt. Ein unbekannter Körperfettanteil wird nicht geraten.

Hantelgewicht direkt pro Satz über die native Auswahl wählen: 2.5, 3.5, 4.5, 5.5, 6.5, 8, 9, 10, 11.5, 13.5, 16, 18, 20.5, 22.5 und 24 kg. Diese Liste wird einmalig auch für bestehende Installationen übernommen und für Steigerungsvorschläge genutzt. Historische oder laufende Lasten ausserhalb der Liste werden nicht gerundet, sondern als «bisher» beibehalten. Körpergewicht und Körperfett werden dadurch nicht verändert.

Die installierte App nutzt für ihren Rahmen die stabile Viewporthöhe (100vh), der normale Browser-Tab weiterhin die dynamische Höhe. Der untere Sicherheitsabstand wird einmalig an der Navigation reserviert, nicht zusätzlich am Inhalt. Darstellung und Systemauswahl müssen auf einem echten iPhone bestätigt werden.

Nackenempfindlichkeit, Übungssperren sowie Beschwerden vor, während, nach und am Folgetag können dokumentiert werden. Sperren gelten auch für Vorlagen, Übungsalternativen und Progression. Neue neurologische Symptome pausieren die Trainingsfreigabe; die App ersetzt keine ärztliche oder physiotherapeutische Beurteilung.

## Training und Fortschritt

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

## Ernährung

Mifflin–St Jeor mit sitzendem Alltag (Faktor 1,2) plus separat erfasster aktiver Energie. MET-Werte sind grobe, gekennzeichnete Schätzungen. Gerätewerte können als aktive oder gesamte Energie eingegeben werden; bei Gesamtenergie wird der Ruheanteil abgezogen. Verknüpfte Cardio-/Workout-Einträge werden nur einmal berücksichtigt. Ohne Intensität oder Gerätewert wird kein Verbrauch erfunden.

Protein: konfigurierter Bereich 2,2–2,6 g/kg geschätzter Magermasse. Ballaststoff-Richtwert 30 g/Tag. Tageswerte aus Yazio werden manuell übernommen; keine automatische Yazio-Anbindung.

Der Check-in vergleicht zwei Sieben-Tage-Fenster. Für eine Beurteilung sind mindestens drei Gewichtstage je Fenster und zehn Ernährungstage erforderlich. Bei Rekomposition werden zusätzlich Umfangsmessungen berücksichtigt. Änderungen sind prüfbare Vorschläge und werden nicht automatisch auf das Kalorienziel angewandt.

## Sonntagskochen

- Ein oder zwei Gerichte; Portionen pro Gericht frei einstellbar, z.B. ein Gericht mit insgesamt fünf Portionen.
- Import und Export von recipes.json Schema 1.3, plus optionalen Feldern für Rohmengen, vollständige Nährwerte, Produktquelle, Packungspreis und gewogenes Endgewicht.
- Rezepteditor mit Schweizer Produktnamen, Mengen, Etikettwerten, Natrium bzw. Salzumrechnung und Kochschritten.
- Eine gemeinsame Kochsession mit aktiver Arbeit, passiven Garzeiten und Gerätebelegung. Der Scheduler legt aktive Arbeit an den Beginn eines Schritts; zusätzliche Zwischenaktionen müssen als eigene Schritte erfasst werden.
- Gemeinsame Einkaufsliste, aufgerundete Einkaufspackungen und Budgetprüfung. Fehlende Preise werden sichtbar ausgewiesen. Snacks und Wochenende ergänzen, bevor das Wochenbudget vollständig beurteilt wird.
- Kalorien, Protein, Kohlenhydrate, Fett, Ballaststoffe und Natrium pro Portion und pro 100 g. Werte pro 100 g bleiben ohne Endgewicht offen.
- JSON-Einkaufsliste, iPad-Rezeptdatei, kopierbare Yazio-Werte und Druckansicht (im Druckdialog als PDF speichern).

Die zwei mitgelieferten Rezeptbasen sind Beispiele, kein automatisch personalisierter Ernährungsplan. Quellen und Erfassungsdatum sind bei den Zutaten hinterlegt. Etikettangaben mit einer Kleiner-als-Grenze wurden als Obergrenze übernommen; die Ergebnisse sind Näherungen. Preise sind Richtwerte. Produktwechsel und tatsächlich verwendete Mengen müssen nachgeführt werden.

## Daten, Backups und Offline-Betrieb

Bestehende Schlüssel für Training, Gewicht, Cardio, Fotos und Vorlagen bleiben erhalten. Neue Coaching-Daten liegen unter af_coach. JSON-Backups enthalten auch diese Daten und den laufenden Trainingsentwurf. Alte Backups können weiterhin importiert werden. CSV und Apple-Health-XML sind Teilauszüge und setzen den Status eines vollständigen Backups nicht mehr zurück.

Der Service Worker speichert alle lokalen Laufzeitdateien und aktualisiert die Offline-Kopie nach erfolgreichen Onlineabrufen. Ein neuer Cache wird erst aktiviert, wenn alle Dateien gespeichert sind.

Benachrichtigungen werden auf Mobilgeräten über den Service Worker angezeigt. Der lokale Erinnerungstimer ist nur bei geöffneter App aktiv. Für Erinnerungen bei geschlossener App eine geplante Woche als ICS in den eigenen Kalender importieren und dort Uhrzeit und Alarm festlegen. Es gibt keinen Push-Server und keine Hintergrundzustellungsgarantie.

## Entwicklung und Tests

    npm ci
    npm test

coach-core.js enthält die unabhängig testbaren Berechnungen, coach.js die Integration mit der bestehenden App und coach-recipes.js den Rezept-/Kochbereich. Die Tests prüfen Berechnungen, DOM-Abläufe, Bestandsdaten, JSON-Roundtrips, sichere Textdarstellung und den Offline-Cache.

Die automatisierte DOM-Prüfung ersetzt keinen Gerätetest. Installation, Layout, Tastatur, Sperrbildschirm, Audio/Haptik und Benachrichtigungen sollten vor einer Veröffentlichung zusätzlich auf dem Ziel-iPhone/iPad bzw. Android-Gerät geprüft werden.

## Grundlagen

- Mifflin–St Jeor: https://pubmed.ncbi.nlm.nih.gov/2305711/
- ACSM Progressionsgrundlage: https://pubmed.ncbi.nlm.nih.gov/19204579/
- Aktivitätswerte und MET-Definition: https://pacompendium.com/
- Nackenbeschwerden und Warnzeichen: https://www.nhsinform.scot/illnesses-and-conditions/muscle-bone-and-joints/neck-and-back-problems-and-conditions/neck-problems/
- Mobile Benachrichtigungen: https://developer.mozilla.org/en-US/docs/Web/API/Notification/Notification
