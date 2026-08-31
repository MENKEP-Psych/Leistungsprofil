# Leistungsprofil

Desktop-App (Electron) für Neuropsychologen zur Eingabe neuropsychologischer Testergebnisse und deren Darstellung als patientenübergreifendes Leistungsprofil (Prozentrang-Grafik) inkl. PDF-Export.

## Language

**Rohwert**:
Der unmittelbar am Test erhobene, noch nicht normierte Messwert (z. B. Bearbeitungszeit in ms, Anzahl Fehler, erreichte Punktzahl). Wird in `TestResult.rawValues` gespeichert.
_Avoid_: RW (nur als Abkürzung in der UI, nicht als Begriff), Messwert

**Normwert / Prozentrang (PR)**:
Der aus dem Rohwert unter Berücksichtigung von Alter/Bildung/Geschlecht anhand einer Normtabelle abgeleitete Vergleichswert (0–100). Bei den meisten Tests automatisch berechnet (VLMT, TMT, Mosaik, Zahlen-/Blockspanne, LG, TOL, ROCFT, WMS-VW, ZZT), bei TAP-Kennwerten wird er vom Untersucher von Hand aus dem TAP-Programm abgelesen und eingetragen — für TAP gibt es keine hinterlegte Normtabelle und keine Berechnung. Wird in `TestResult.percentileRanks` gespeichert (bei TAP-SD-Werten abweichend direkt in `rawValues`, siehe Code-Kommentare in `useProfileData.tsx`). Ein gespeicherter PR kann von einer frischen Neuberechnung abweichen, wenn sich seit dem Speichern Geburtsdatum, Norm-Datei oder eine Norm-Korrektur geändert hat (die Neuberechnung läuft nur manuell über den Admin-Tab).
_Avoid_: Profilwert (das ist die visuelle Position im Leistungsprofil, kein eigenständiger Datenwert), Score

**Norm-Korrektur (Override)**:
Die einzige Möglichkeit, einen *berechneten* PR von Hand anzupassen: eine im Normen-Verifizieren-Tab von einer/einem Admin eingetragene Ersetzung eines einzelnen Normtabellen-Werts. Global (gilt für alle Patient:innen), adressiert über `testId|kennwert|rohwert|altersgruppe`, hält alten und neuen Wert plus Kürzel und Datum fest. Nicht zu verwechseln mit der TAP-Handeingabe (dort ist *jeder* PR handgetippt, ohne dass etwas „überschrieben" würde) und nicht mit einer Anpassung am einzelnen `TestResult` (die existiert nicht — Rohwerte ändern rechnet den PR neu, überschreibt ihn aber nicht gezielt).
_Avoid_: „manuell angepasster Prozentrang" ohne Kontext (dreideutig: Override vs. TAP-Handeingabe vs. veralteter gespeicherter Wert)

**Fehlerbericht**:
Eine über „Fehler melden" erzeugte, automatisch anonymisierte JSON-Datei zu genau einem Fall, die gefahrlos per Mail verschickt werden kann (`lib/bugReport.ts` / `lib/anonymize.ts`). Enthält neben Fehlerbeschreibung und anonymisiertem Fall auch Diagnose-Kontext: App-/Build-Version, PR-Nachrechnung (gespeichert ↔ frisch berechnet, mit Alter zum Testzeitpunkt), alle Norm-Korrekturen/-Prüfungen, Norm-Datei-Fingerabdrücke und den Stand der selbst gesammelten TAP-Normdaten.
_Avoid_: Befund (das ist der klinische Freitext-Bericht zum Patienten), Auswertung

**Leistungsprofil**:
Die Sammelansicht aller Testergebnisse eines Patienten als PR-Balkengrafik (`PRProfile.tsx`), gruppiert nach kognitiven Domänen. Datenquelle ist `useProfileData.tsx`, das aus den rohen `TestResult`-Einträgen die Anzeige-Zeilen (`PRResult[]`) ableitet.
_Avoid_: Profil (zu unspezifisch), Befund (das ist ein eigener, separater Freitext-Bericht, siehe `BefundTab.tsx`)

**'n/a' (Sentinel)**:
Interner Platzhalterwert für "kein Normwert vorhanden" bei einem an sich validen (nicht abgebrochenen) Testergebnis. Steuert in `PRProfile.tsx`, dass statt einer PR-Zahl ein "–" angezeigt wird, aber der Rohwert trotzdem sichtbar bleibt. Nicht zu verwechseln mit einem leeren String `''` (Formular-Eingabe-Artefakt ohne Bedeutung) oder mit `undefined` (fehlender Datensatz/Kennwert insgesamt).
_Avoid_: leerer String als Ersatz dafür verwenden

**Testabbruch**:
Ein Testergebnis, bei dem `TestResult.aborted === true` gesetzt ist — die Testung wurde vorzeitig beendet. Einzelne Kennwerte dieser Sitzung können trotzdem vollständige Rohwerte und PR haben (was vor dem Abbruch bereits erhoben wurde); nur Kennwerte ohne PR werden in der Anzeige als "k.A." markiert, nicht die ganze Sitzung pauschal.
_Avoid_: "kein Normwert" als Synonym (ein abgebrochener Test kann für einzelne Kennwerte sehr wohl einen PR haben)

**Wiederholungstestung**:
Eine zweite, eigenständige Durchführung desselben Tests an einem anderen Kalendertag — ein zweiter, separater `TestResult`-Eintrag mit eigenem Datum, keine Fortsetzung derselben Sitzung. Bei TAP mit Abstand die häufigste Form der Wiederholung.
_Avoid_: Eingangs-/Abschlusstestung als Synonym (das ist etwas anderes, siehe unten)

**Eingangs-/Abschlusstestung (TAP-spezifisch)**:
Bei TAP zusätzlich zur Wiederholungstestung existierendes Konzept: zwei Messzeitpunkte *innerhalb derselben Sitzung* (`e_`-Rohwertfelder = Eingang, `b_`-Rohwertfelder = Abschluss), z. B. vor/nach einer Reha-Maßnahme am selben Tag. Technisch getrennt von der (datumsbasierten) Wiederholungstestung, auch wenn beide Konzepte im UI teils ähnlich aussehen.
_Avoid_: Wiederholungstestung als Synonym

**PDF Export (regulär)**:
Der produktiv genutzte Leistungsprofil-PDF-Export, ausgelöst über den **PDF**-Button in der Kopfleiste. Kette: `PatientHeader` → `App.handleExportPDF` → Fenster-Event `app:pdf-export` → `ProfileTab.handleExportPDF` → (Electron) IPC `pdf:exportProfile` → verstecktes Fenster mit `?print=1` → `PrintProfileApp` + `PrintProfile.tsx` + `print.css` → `webContents.printToPDF`. Rendert die geteilte `PRProfile.tsx` im `printMode`. **Nicht anfassen** – Änderungswünsche an der PDF-Darstellung gehen in *PDF Experimental*.
_Avoid_: „der PDF-Export" ohne Zusatz, wenn PDF Experimental gemeint sein könnte

**PDF Experimental**:
Eine vollständige, produktiv-unabhängige Kopie der PDF-Export-Pipeline hinter dem Button **„PDF Exp."** (amber, Kolben-Icon, direkt rechts vom regulären PDF-Button). Erzeugt inhaltlich dasselbe Leistungsprofil, dient aber als gefahrloser Spielplatz zum Umbau der PDF-Darstellung. Eigene Dateien: `PrintProfileExperimental.tsx`, `PrintProfileAppExperimental.tsx`, `print-experimental.css`; eigene Kanäle mit Suffix `Experimental` / `-experimental` (IPC `pdf:exportProfileExperimental`, Event `app:pdf-export-experimental`, `dbExportProfilePdfExperimental`, URL-Marker `?print=exp`). Geteilt bleiben nur `PRProfile.tsx`, `useProfileData.tsx` und die `writePdf`-Plumbing. Steuerschalter: `PDF_EXPERIMENTAL_ENABLED` in `src/lib/featureFlags.ts` (dort auch die vollständige Doku). Nur in der Desktop-App, kein Screenshot-Fallback. Dateiname trägt den Zusatz „(Experimentell)".
_Avoid_: als Ersatz für den regulären Export behandeln, solange der Schalter in Release-Builds auf `false` steht
