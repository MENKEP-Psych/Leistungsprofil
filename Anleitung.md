# Anleitung – Leistungsprofil App

## Inhaltsverzeichnis

1. [Programm herunterladen und starten](#1-programm-herunterladen-und-starten)
2. [Anmelden](#2-anmelden)
3. [Übersicht: Was ist wo in der App?](#3-übersicht-was-ist-wo-in-der-app)
4. [Patienten anlegen](#4-patienten-anlegen)
5. [Patienten bearbeiten](#5-patienten-bearbeiten)
6. [Warum Diagnosen eingeben?](#6-warum-diagnosen-eingeben)
7. [Patient entlassen](#7-patient-entlassen)
8. [Entlassenen Patienten zurückholen (Wiederzulassung)](#8-entlassenen-patienten-zurückholen-wiederzulassung)
9. [Frühere Aufnahmen desselben Patienten](#9-frühere-aufnahmen-desselben-patienten)
10. [Die interne Notiz](#10-die-interne-notiz)
11. [Tastenkürzel (Keyboard Shortcuts)](#11-tastenkürzel-keyboard-shortcuts)
12. [TAP-Täglich](#12-tap-täglich)
13. [PDF-Export](#13-pdf-export)
14. [Das Archiv](#14-das-archiv)
15. [Warum „Eigene" Patienten?](#15-warum-eigene-patienten)
16. [Benachrichtigungen empfangen](#16-benachrichtigungen-empfangen)
17. [Benachrichtigungen senden](#17-benachrichtigungen-senden)
18. [Automatische Benachrichtigung: Patient nicht erschienen (TAP)](#18-automatische-benachrichtigung-patient-nicht-erschienen-tap)
19. [Testergebnisse eintragen](#19-testergebnisse-eintragen)
20. [Patient musste abbrechen](#20-patient-musste-abbrechen)
21. [Das Leistungsprofil interpretieren](#21-das-leistungsprofil-interpretieren)
22. [Neglect und visuelles Scanning eintragen](#22-neglect-und-visuelles-scanning-eintragen)
23. [Linien halbieren](#23-linien-halbieren)
24. [Optionen-Tab – für alle Benutzer](#24-optionen-tab--für-alle-benutzer)
25. [Optionen-Tab – nur für Administratoren](#25-optionen-tab--nur-für-administratoren)
26. [Normen verifizieren](#26-normen-verifizieren)
27. [Testergebnisse bearbeiten](#27-testergebnisse-bearbeiten)
28. [Testergebnisse löschen](#28-testergebnisse-löschen)
29. [Nachvollziehbarkeit: Aktivitätslog / Audit-Log](#29-nachvollziehbarkeit-aktivitätslog--audit-log)
30. [Was ist bei einem Audit wichtig?](#30-was-ist-bei-einem-audit-wichtig)
31. [Technische Hinweise: Verschlüsselung und Sicherheit](#31-technische-hinweise-verschlüsselung-und-sicherheit)

---

## 1. Programm herunterladen und starten

### Wo bekomme ich das Programm?

Das Programm wird über GitHub als fertige `.exe`-Datei bereitgestellt. Sie müssen nichts installieren – die Datei läuft direkt.

**So laden Sie die neueste Version herunter:**

1. Öffnen Sie einen Webbrowser (z. B. Edge oder Chrome).
2. Gehen Sie zur Adresse:
   `https://github.com/MENKEP-Psych/Leistungsprofil/releases`
3. Sie sehen eine Liste von Versionen. Ganz oben steht die **neueste Version**.
4. Klicken Sie auf den Abschnitt **„Assets"** unter der neuesten Version – falls er zugeklappt ist, klicken Sie darauf, um ihn aufzuklappen.
5. Laden Sie die Datei herunter, die auf `.exe` endet (z. B. `Leistungsprofil-Setup-1.2.3.exe` oder ähnlich).

### Alte Version löschen

> **Wichtig:** Bevor Sie die neue Version benutzen, löschen Sie bitte die alte `.exe`-Datei. Zwei Versionen gleichzeitig zu benutzen kann zu Problemen führen.

1. Suchen Sie die alte `.exe`-Datei (z. B. auf dem Desktop oder in Ihrem Downloadordner).
2. Klicken Sie mit der rechten Maustaste darauf → **Löschen**.

### Neue Version starten

- Doppelklicken Sie auf die neue `.exe`-Datei, um das Programm zu starten.
- **Optional:** Ziehen Sie die Datei auf den Desktop, um eine Verknüpfung zu haben.
- **Optional:** Klicken Sie mit der rechten Maustaste auf die Taskleiste unten → **An Taskleiste anheften**, wenn Sie die Datei direkt von der Taskleiste starten möchten.

> Das Programm startet direkt – es öffnet sich ein Fenster mit dem Anmeldebildschirm.

---

## 2. Anmelden

Beim Start sehen Sie einen Anmeldebildschirm.

- Geben Sie Ihren **Benutzernamen** und Ihr **Passwort** ein.
- Drücken Sie **Enter** oder klicken Sie auf **„Anmelden"**.

Falls Sie Ihr Passwort vergessen haben: Wenden Sie sich an einen Administrator. Dieser kann Ihr Passwort unter **Optionen → Benutzerverwaltung** zurücksetzen.

---

## 3. Übersicht: Was ist wo in der App?

Die App besteht aus zwei Bereichen:

**Linke Seitenleiste (Navigation):**
- **Patienten** – Die Patientenübersicht (Liste aller Patienten)
- **Test-Reiter** (z. B. TMT A/B, ZZT, TAP, VLMT usw.) – Hier tragen Sie Testergebnisse für den ausgewählten Patienten ein. Diese Reiter sind erst anklickbar, wenn ein Patient ausgewählt ist.
- **Optionen** – Einstellungen, Benutzerverwaltung, Normen, Audit-Log (ganz unten)

**Oben im Hauptbereich:**
- Wenn ein Patient ausgewählt ist, erscheint oben eine **Patientenzeile** mit Name, Geburtsdatum und Schnellzugriff auf das Leistungsprofil, die Bearbeitung und die Entlassung.
- Über das **Glockensymbol** (oben rechts in der Seitenleiste) erreichen Sie die Benachrichtigungen.

**Hauptbereich (rechts):**
- Zeigt den aktuell ausgewählten Tab-Inhalt (Patientenliste, Testergebnis-Formular, Leistungsprofil etc.)

---

## 4. Patienten anlegen

1. Klicken Sie in der Seitenleiste auf **Patienten**.
2. Klicken Sie oben rechts auf **„Neuer Patient"**.
3. Füllen Sie die Pflichtfelder aus:
   - **Name** (Vor- und Nachname)
   - **Geburtsdatum**
   - **Geschlecht** (M / W / D)
4. Optional können Sie zusätzlich eintragen:
   - Diagnose(n)
   - Zuweisende Neuropsychologin
   - Station, Zimmer
   - Bildungsjahre (wichtig für bestimmte Normen, z. B. Tower of London)
5. Klicken Sie auf **„Speichern"**.

Der Patient erscheint nun in der Patientenliste.

---

## 5. Patienten bearbeiten

1. Wählen Sie den Patienten in der Liste aus.
2. Klicken Sie in der Patientenzeile oben auf das **Stift-Symbol** (Bearbeiten).
3. Ändern Sie die gewünschten Daten.
4. Klicken Sie auf **„Speichern"**.

Alle Änderungen werden sofort gespeichert und im Audit-Log festgehalten.

---

## 6. Warum Diagnosen eingeben?

Die Diagnosen sind freiwillig, aber **wichtig für die Auswertung und spätere Berichte**. Sie erscheinen im Leistungsprofil-PDF und helfen dabei:

- Den neuropsychologischen Befund im klinischen Kontext zu interpretieren.
- Statistische Auswertungen (z. B. im Optionen-Tab unter „Analytik") nach Diagnosegruppen zu filtern.
- Kollegen beim Lesen des Profils sofort einen Überblick zu geben.

Sie können mehrere Diagnosen durch Komma getrennt eintragen (z. B. `Schlaganfall, Neglect`).

---

## 7. Patient entlassen

1. Wählen Sie den Patienten aus.
2. Klicken Sie in der Patientenzeile oben auf den Button **„Entlassen"** (Pfeil-nach-unten-Symbol).
3. Bestätigen Sie die Entlassung.

Der Patient wird als **„entlassen"** markiert und aus der aktiven Liste entfernt. Alle Daten bleiben gespeichert und sind im Archiv weiterhin einsehbar.

---

## 8. Entlassenen Patienten zurückholen (Wiederzulassung)

Falls ein Patient wieder aufgenommen wird:

1. Öffnen Sie die Patientenübersicht und aktivieren Sie das **Archiv** (Button „Archiv" in der Filterzeile).
2. Suchen Sie den Patienten.
3. Wählen Sie ihn aus – oben erscheint ein Button **„Entlassung rückgängig"** (Pfeil zurück).
4. Klicken Sie darauf. Der Patient ist wieder aktiv.

> Alternativ können Sie auch einen **neuen** Patienten anlegen. Die App erkennt dann automatisch, dass es eine frühere Aufnahme desselben Patienten gibt (siehe nächster Abschnitt).

---

## 9. Frühere Aufnahmen desselben Patienten

Wenn ein Patient unter demselben Namen und Geburtsdatum bereits einmal in der App war (z. B. eine frühere stationäre Aufnahme), erscheint in der Patientenzeile oben ein **Hinweis** mit einem Link zu den früheren Aufnahmen.

So können Sie schnell nachschauen, welche Tests damals durchgeführt wurden und wie die Ergebnisse waren, ohne die aktuelle Akte zu vermischen.

---

## 10. Die interne Notiz

Oben in der Patientenzeile gibt es ein Notizfeld (Stift-Symbol neben dem Namen).

- Diese Notiz ist **nur intern** sichtbar – sie erscheint **nicht** im PDF-Export.
- Gedacht für kurze Hinweise wie z. B. „Termine nur vormittags", „Dolmetscher erforderlich" oder „Hörhilfe".
- Klicken Sie auf das Notizfeld, tippen Sie Ihren Text, und drücken Sie **Speichern** (oder klicken Sie woanders hin – die Notiz wird automatisch gespeichert).

---

## 11. Tastenkürzel (Keyboard Shortcuts)

Mit diesen Tastenkürzeln können Sie die App vollständig ohne Maus bedienen:

| Tastenkombination | Funktion |
|---|---|
| **Strg + S** | Aktuelles Testergebnis speichern (im aktiven Test-Tab) |
| **Bild ↓** (Page Down) | Zum nächsten Test-Tab wechseln |
| **Bild ↑** (Page Up) | Zum vorherigen Test-Tab wechseln |
| **↑ / ↓** (Pfeiltasten) | In der Patientenliste nach oben/unten navigieren |
| **Enter** | Ausgewählten Patienten in der Patientenliste öffnen |
| **Strg + <** | Direkt zum Leistungsprofil des aktuellen Patienten |
| **Strg + Y** | Zurück zur Patientenübersicht |
| **/// (3× Schrägstrich)** | Direkt zum Leistungsprofil (nur außerhalb von Eingabefeldern) |
| **\*\*\* (3× Stern)** | Zurück zur Patientenübersicht (nur außerhalb von Eingabefeldern) |

**Typischer Arbeitsablauf ohne Maus:**
1. Mit **↑/↓** einen Patienten auswählen → **Enter** zum Öffnen
2. Mit **Bild ↓** / **Bild ↑** durch die Tests navigieren
3. Werte eingeben → **Strg + S** speichern
4. Mit **Strg + <** das Leistungsprofil aufrufen

---

## 12. TAP-Täglich

Der Button **„TAP-Täglich"** in der Patientenübersicht (oben rechts) erstellt ein **PDF mit einer tabellarischen Übersicht** aller aktiven Patienten und ihrer zuletzt eingetragenen TAP-Ergebnisse.

- Nützlich für die tägliche Visite oder Besprechung.
- Das PDF wird automatisch im konfigurierten PDF-Ordner gespeichert (oder direkt geöffnet, falls kein Ordner eingestellt ist).

---

## 13. PDF-Export

Im Reiter **„Leistungsprofil"** (Profil-Ansicht des Patienten) finden Sie oben einen Button **„PDF exportieren"**.

- Das PDF enthält: Patientenname, Geburtsdatum, Diagnose(n), alle eingetragenen Testergebnisse als Prozentrang-Grafik, und eine tabellarische Auflistung aller Werte.
- Das PDF wird automatisch im PDF-Ordner gespeichert, der unter **Optionen → PDF-Speicherordner** eingestellt werden kann.
- Ist kein Ordner eingestellt, wird das PDF direkt geöffnet/heruntergeladen.

> Tipp: Das PDF kann auch als Anhang für den Arztbrief oder die Teamkommunikation verwendet werden.

---

## 14. Das Archiv

Das Archiv enthält alle **entlassenen Patienten**.

- In der Patientenübersicht klicken Sie auf den Button **„Archiv"** (erscheint nur, wenn es entlassene Patienten gibt).
- Archivierte Patienten werden leicht ausgegraut angezeigt.
- Sie können archivierte Patienten **ansehen**, aber **nicht mehr bearbeiten** (keine neuen Tests eintragen).
- Eine Wiederzulassung ist möglich (siehe Abschnitt 8).

---

## 15. Warum „Eigene" Patienten?

Da mehrere Neuropsychologinnen die App gleichzeitig nutzen können, zeigt die Patientenliste standardmäßig **alle aktiven Patienten**.

Mit dem Button **„Eigene"** in der Filterleiste können Sie die Liste auf **Ihre eigenen Patienten** einschränken – also die Patienten, bei denen **Ihr Benutzername** als zuständige Neuropsychologin eingetragen ist.

Das hilft, den Überblick zu behalten, wenn die Liste lang wird.

---

## 16. Benachrichtigungen empfangen

Das **Glockensymbol** in der linken Seitenleiste zeigt an, ob neue Benachrichtigungen vorhanden sind (rote Zahl = Anzahl ungelesen).

- Klicken Sie auf die Glocke, um die Benachrichtigungsansicht zu öffnen.
- Dort sehen Sie alle empfangenen Nachrichten mit Absender, Datum und Inhalt.
- Klicken Sie auf eine Nachricht, um sie als **gelesen** zu markieren.
- Mit **„Alle als gelesen markieren"** können Sie alle auf einmal abarbeiten.
- Einzelne Nachrichten können gelöscht werden.

---

## 17. Benachrichtigungen senden

Im Reiter **TAP** gibt es die Möglichkeit, manuell eine Benachrichtigung an eine Kollegin zu senden (z. B. wenn ein Patient nicht erschienen ist und die zuständige Neuropsychologin informiert werden soll).

- Wählen Sie im TAP-Tab die Option **„Nicht erschienen"** aus.
- Geben Sie ggf. an, welcher TAP-Teil betroffen ist.
- Beim Speichern wird automatisch eine Benachrichtigung an die zuständige Neuropsychologin gesendet.

---

## 18. Automatische Benachrichtigung: Patient nicht erschienen (TAP)

Wenn Sie im TAP-Tab:

1. **„Nicht erschienen"** aktivieren,
2. das Ergebnis speichern,

...und der Patient einer **anderen** Neuropsychologin zugewiesen ist als Ihrem eigenen Benutzernamen, wird automatisch eine Benachrichtigung an diese Kollegin geschickt. Der Text der Nachricht enthält:

- Name und Geburtsdatum des Patienten,
- Datum der verpassten Messung,
- ggf. den betroffenen TAP-Teil,
- Ihren Benutzernamen als Absender (mit dem Hinweis „Automatisch gesendet").

Die zuständige Kollegin sieht die Benachrichtigung beim nächsten Öffnen der App an der roten Zahl auf der Glocke.

---

## 19. Testergebnisse eintragen

1. Wählen Sie einen Patienten aus der Liste aus.
2. Klicken Sie in der Seitenleiste auf den gewünschten Test (z. B. **TMT A/B**, **VLMT**, **TAP** usw.).
3. Tragen Sie die Rohdaten in die Felder ein (Zeiten, Punkte, Fehler – je nach Test).
4. Die **Prozentränge (PR)** werden **automatisch berechnet** und live angezeigt, während Sie tippen.
5. Optional: Datum, Untersucher/in, und eine kurze Notiz eintragen.
6. Klicken Sie auf **„Speichern"** – oder drücken Sie **Strg + S**.

Das Ergebnis erscheint sofort im **Verlauf** weiter unten auf der Seite und wird im Leistungsprofil berücksichtigt.

---

## 20. Patient musste abbrechen

Falls ein Patient den Test **nicht vollständig** durchführen konnte:

1. Klicken Sie im Test-Tab auf **„Abgebrochen"** (oder den entsprechenden Abbruch-Button).
2. Tragen Sie optional einen Grund ein (z. B. „Patient erschöpft nach Aufgabe 3").
3. Tragen Sie ein, was bisher erreicht wurde (die bereits eingegebenen Werte bleiben erhalten).
4. Speichern Sie wie gewohnt.

Abgebrochene Ergebnisse werden im Verlauf mit einem **orangenen „Abgebrochen"-Badge** markiert und im Leistungsprofil entsprechend gekennzeichnet. Sie werden bei der PR-Berechnung eingeschränkt berücksichtigt.

---

## 21. Das Leistungsprofil interpretieren

Das Leistungsprofil ist die zentrale Übersicht aller Testergebnisse eines Patienten.

**So öffnen Sie es:**
- Klicken Sie oben in der Patientenzeile auf **„Leistungsprofil"** – oder drücken Sie **Strg + <**.

**Was Sie sehen:**

- **Balken pro Domäne:** Für jede kognitive Domäne (Aufmerksamkeit, Gedächtnis, Visuo-Konstruktiv, Exekutiv, Exploration) werden die Testergebnisse als Prozentrang-Balken dargestellt.
- **Farbcodes:**
  - 🟢 **Grün / Türkis** = Überdurchschnittlich (PR > 50)
  - 🟡 **Gelb / Orange** = Durchschnittlich bis leicht unterdurchschnittlich (PR 16–50)
  - 🔴 **Rot** = Deutlich unterdurchschnittlich (PR < 16)
- **Mehrere Messungen:** Wenn ein Test mehrmals durchgeführt wurde, zeigt das Profil die aktuellste Messung sowie eine Markierung der früheren Werte (Verlauf).
- **PDF exportieren:** Mit dem Button „PDF exportieren" wird ein druckfertiger Bericht erstellt.

**Hinweis zur Interpretation:**
- Ein PR von 50 entspricht dem Durchschnitt der Normgruppe.
- Ein PR von 16 entspricht 1 Standardabweichung unter dem Durchschnitt (klinisch auffällig).
- Ein PR von 2 entspricht 2 Standardabweichungen (deutlich beeinträchtigt).
- Die verwendete Normgruppe (Altersgruppe, ggf. Bildungsjahre) wird unter jedem Testergebnis angezeigt.

---

## 22. Neglect und visuelles Scanning eintragen

Im Reiter **„Explorationsaufgaben"** (Seitenleiste, unter „6. Exploration") tragen Sie die Ergebnisse der Neglect- und Scanning-Untersuchungen ein.

Folgende Aufgaben werden erfasst:

- **Linienbisektion** (Linien halbieren) – siehe nächsten Abschnitt
- **Dreieck-Durchstreichen**
- **Apples-Test**
- **Abzeichen-Durchstreichen**
- **Uhren-Test**
- **Freitext** für qualitative Beobachtungen

Für jede Aufgabe können Sie das Ergebnis qualitativ beschreiben (z. B. „linksseitiger Neglect, ca. 40% der Items übersehen"). Es gibt keine automatische PR-Berechnung, da diese Aufgaben qualitativ ausgewertet werden.

---

## 23. Linien halbieren

Der **Linien-Halbierungs-Test** (Line Bisection) ist Teil der Explorationsaufgaben im Reiter **„Explorationsaufgaben"**.

- Tragen Sie dort Ihre Beobachtung im entsprechenden Freitext-Feld ein, z. B.:
  - „Deviation nach rechts ca. 15 mm"
  - „Kein Neglect nachweisbar"
- Eine automatische Norm-Auswertung ist für diese qualitative Aufgabe nicht hinterlegt.

---

## 24. Optionen-Tab – für alle Benutzer

Klicken Sie in der Seitenleiste ganz unten auf **„Optionen"**.

Folgende Bereiche sind für alle Benutzer zugänglich:

- **Eigenes Konto:** Zeigt Ihren Benutzernamen und Ihre Rolle (Benutzer / Administrator). Sie können Ihr eigenes Passwort hier ändern.
- **Anleitung:** Eine kurze Übersicht über die wichtigsten Funktionen der App (direkt in der App).
- **Erscheinungsbild:** Umschalten zwischen **Hell- und Dunkelmodus** (Tag/Nacht-Modus).
- **PDF-Speicherordner:** Hier stellen Sie ein, in welchem Ordner die exportierten PDFs automatisch gespeichert werden sollen. Klicken Sie auf „Ordner auswählen" und wählen Sie einen Ordner auf Ihrem Computer oder einem Netzlaufwerk.

---

## 25. Optionen-Tab – nur für Administratoren

Administratoren sehen zusätzlich folgende Bereiche:

- **Benutzerverwaltung:** Bestehende Benutzer anzeigen, neue anlegen, Passwörter zurücksetzen, Benutzer löschen. Jeder Benutzer hat eine Rolle: `Benutzer` (normale Rechte) oder `Administrator` (volle Rechte).
- **Notfall-Zugang:** Ein spezieller Wiederherstellungscode, mit dem im Notfall (alle Passwörter vergessen) mit dem Benutzernamen `recovery` eingeloggt werden kann. Der Code ist mit dem Inhalt der Datei `.recovery` im geteilten Ordner identisch. **Wichtig: Diesen Code sicher aufbewahren, getrennt vom Computer!**
- **Server-Datenbankpfad (IT):** Pfad zur zentralen Datenbank auf dem Netzlaufwerk (z. B. `G:\Leistungsprofil\leistungsprofil.sqlite`). Nur für die IT-Abteilung relevant. Zum Bearbeiten ist ein separates IT-Passwort erforderlich.
- **Normen verifizieren:** Prüfwerkzeug für die hinterlegten Normwerte (siehe Abschnitt 26).
- **Analytik:** Statistische Auswertungen über alle Patienten und Testergebnisse (z. B. Häufigkeiten, Durchschnittswerte nach Diagnosegruppe).
- **Aktivitätslog (Audit-Log):** Vollständiges Protokoll aller Aktionen in der App (siehe Abschnitt 29).

---

## 26. Normen verifizieren

Unter **Optionen → Normen verifizieren** (nur Administratoren) können Sie die hinterlegten Normwerte überprüfen.

- Geben Sie einen Testwert und ein Alter ein, und lassen Sie sich den berechneten Prozentrang anzeigen.
- So können Sie kontrollieren, ob die App denselben PR berechnet wie das Testhandbuch.
- Nützlich bei Rückfragen oder wenn neue Normtabellen eingeführt werden.

---

## 27. Testergebnisse bearbeiten

Ja, Testergebnisse können nachträglich bearbeitet werden.

1. Öffnen Sie den betreffenden Test-Reiter für den Patienten.
2. Scrollen Sie nach unten zum **Verlauf** (Liste der gespeicherten Ergebnisse).
3. Klicken Sie beim Ergebnis, das Sie ändern möchten, auf das **Stift-Symbol** (Bearbeiten).
4. Das Formular wird mit den alten Werten befüllt.
5. Ändern Sie die Werte und klicken Sie auf **„Speichern"** (oder **Strg + S**).

Jede Bearbeitung wird im **Audit-Log** mit Datum, Uhrzeit und Benutzernamen festgehalten.

---

## 28. Testergebnisse löschen

Ja, Testergebnisse können gelöscht werden.

1. Öffnen Sie den betreffenden Test-Reiter.
2. Scrollen Sie zum **Verlauf**.
3. Klicken Sie beim Ergebnis auf das **Papierkorb-Symbol**.
4. Ein Bestätigungsdialog erscheint – klicken Sie erneut auf „Löschen", um zu bestätigen.

> **Achtung:** Das Löschen kann nicht rückgängig gemacht werden. Auch gelöschte Ergebnisse werden im Audit-Log dokumentiert (mit Datum, Uhrzeit und Benutzername).

---

## 29. Nachvollziehbarkeit: Aktivitätslog / Audit-Log

Unter **Optionen → Aktivitätslog** (nur Administratoren) wird **jede Aktion** in der App protokolliert:

| Aktion | Was wird gespeichert |
|---|---|
| Anmelden / Abmelden | Benutzername, Zeitstempel |
| Patient angelegt | Benutzername, Patientenname, Zeitstempel |
| Patient bearbeitet | Benutzername, Patientenname, Zeitstempel |
| Patient entlassen | Benutzername, Patientenname, Zeitstempel |
| Testergebnis gespeichert | Benutzername, Patientenname, Testname, Werte, Zeitstempel |
| Testergebnis bearbeitet | Benutzername, Patientenname, Testname, neue Werte, Zeitstempel |
| Ergebnis gelöscht | Benutzername, Patientenname, Testname, Zeitstempel |

**Audit-Log exportieren:**
- Klicken Sie auf **„Audit-Log exportieren (.csv)"**.
- Die Datei kann in Excel geöffnet werden und enthält alle Einträge mit Zeitstempel, Benutzername, Aktion, Patientenname und Details.

---

## 30. Was ist bei einem Audit wichtig?

Falls die Dokumentation durch externe Prüfer (z. B. Datenschutzbeauftragte, Qualitätssicherung, MDK) überprüft wird, sind folgende Punkte wichtig:

**Zugriffskontrolle:**
- Jeder Benutzer hat ein individuelles Passwort und einen eigenen Benutzernamen.
- Es gibt keine anonymen Zugriffe – jede Aktion ist einem Benutzernamen zugeordnet.
- Administratoren können jederzeit Benutzer anlegen, sperren oder löschen.

**Datenschutz:**
- Alle Patientendaten werden **verschlüsselt** gespeichert (AES-Verschlüsselung, siehe Abschnitt 31).
- Der Verschlüsselungsschlüssel liegt ausschließlich lokal und wird nicht übertragen.
- Die App sendet keine Daten ins Internet.

**Vollständige Nachvollziehbarkeit:**
- Jede Änderung ist im Audit-Log mit Zeitstempel und Benutzernamen gespeichert.
- Das Audit-Log kann als CSV exportiert werden.
- Gelöschte Einträge sind im Log dokumentiert (wer hat was wann gelöscht).

**Synchronisation (falls eingerichtet):**
- Wenn ein Netzlaufwerk-Pfad konfiguriert ist, werden die Daten mit einer zentralen Datenbank synchronisiert.
- Die Synchronisation erfolgt beim Programmstart (Pull) und kann manuell angestoßen werden (Push).

---

## 31. Technische Hinweise: Verschlüsselung und Sicherheit

**Datenverschlüsselung:**
- Alle Patientendaten (Namen, Geburtsdaten, Testergebnisse) werden vor dem Speichern mit **AES-Verschlüsselung** (CryptoJS) verschlüsselt.
- Der Verschlüsselungsschlüssel wird lokal in einer separaten Schlüsseldatei (`.key`) gespeichert, die sich im Programmdatenordner befindet.
- Ohne den Schlüssel sind die gespeicherten Daten nicht lesbar – nicht einmal für einen IT-Administrator, der direkten Zugriff auf die Datenbankdatei hat.

**Datenbank:**
- Die Daten werden in einer lokalen **SQLite-Datenbank** gespeichert (Datei: `leistungsprofil.sqlite` im Programmdatenordner).
- Optionale Synchronisation mit einer zentralen SQLite-Datenbank auf einem Netzlaufwerk (konfiguriert unter Optionen → Server-Datenbankpfad).

**Audit-Log:**
- Das Audit-Log ist ebenfalls in der Datenbank gespeichert und kann nicht ohne Administratorzugang eingesehen werden.
- Es wird nicht verschlüsselt (da es nur Metadaten wie Benutzernamen und Aktionstypen enthält, keine klinischen Rohdaten).

**Notfall-Zugang:**
- Falls alle Passwörter vergessen werden, kann der Notfall-Wiederherstellungscode verwendet werden (Benutzername: `recovery`, Passwort: der Code aus Optionen → Notfall-Zugang).
- Dieser Code wird in der Datei `.recovery` im geteilten Ordner gespeichert.
- **Bitte sicher und getrennt aufbewahren.**

**Keine Internetverbindung erforderlich:**
- Die App funktioniert vollständig offline.
- Es werden keine Daten an externe Server gesendet.
- Die optionale Synchronisation erfolgt nur innerhalb des lokalen Netzwerks (Netzlaufwerk).

---

*© P. Menke – Alle Rechte vorbehalten. Dieses Programm darf ohne ausdrückliche Genehmigung nicht vervielfältigt, weitergegeben oder anderweitig genutzt werden.*
