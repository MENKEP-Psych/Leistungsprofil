# Neuropsychologisches Leistungsprofil

Desktop-Anwendung zur Erfassung und Auswertung neuropsychologischer Testergebnisse im klinischen Betrieb. Läuft lokal auf jedem Windows-Rechner und synchronisiert Patientendaten über eine gemeinsame Datenbankdatei auf einem Netzlaufwerk.

---

## Kurzübersicht

- Jeder Rechner hat eine **lokale Kopie** der Datenbank
- Beim App-Start wird automatisch der aktuelle Stand vom Server geholt
- Beim Klick auf „Synchronisieren" werden eigene Änderungen zurück auf den Server übertragen und gleichzeitig neue Einträge von anderen Nutzern geholt
- Fällt der Server aus, läuft die App mit der letzten lokalen Kopie weiter
- Alle Patientendaten sind **verschlüsselt** gespeichert (AES-256, Schlüssel = Login-Passwort)
- Kein dauerhaft laufender Dienst auf dem Server nötig

---

## Warum läuft die App lokal und nicht vom Netzlaufwerk?

Windows blockiert das Ausführen von Programm-Komponenten aus Netzwerkpfaden (Sicherheitsrestriktion). Die App muss deshalb lokal auf jedem Rechner liegen. Die **Datenbank** liegt dagegen problemlos auf dem Netzlaufwerk — sie wird beim Start kopiert, nicht ausgeführt.

---

## Einmalige Server-Einrichtung

### 1. Freigegebenen Ordner anlegen

Einen Ordner auf einer **persistenten** Freigabe anlegen, die von Server-Wartungen oder Image-Rotationen unberührt bleibt:

```
\\KLINIKSRV01\Leistungsprofil\
```

Alle Nutzer der App benötigen **Lese- und Schreibrechte** auf diesen Ordner.

### 2. Masterdatenbank erstellen

Die App einmal auf einem beliebigen Rechner starten (ohne Server-Pfad konfiguriert). Sie legt dabei automatisch drei Dateien in `%APPDATA%\Leistungsprofil\` an:

```
leistungsprofil.sqlite          <- Datenbank
leistungsprofil.sqlite.key      <- Verschlüsselungsschlüssel
leistungsprofil.sqlite.recovery <- Notfall-Wiederherstellungscode
```

Diese drei Dateien in den Server-Ordner kopieren:

```
\\KLINIKSRV01\Leistungsprofil\leistungsprofil.sqlite
\\KLINIKSRV01\Leistungsprofil\leistungsprofil.sqlite.key
\\KLINIKSRV01\Leistungsprofil\leistungsprofil.sqlite.recovery
```

### 3. Berechtigungen setzen

| Datei | Wer darf was |
|---|---|
| `leistungsprofil.sqlite` | Alle App-Nutzer: Lesen + Schreiben |
| `leistungsprofil.sqlite.key` | Alle App-Nutzer: Lesen |
| `leistungsprofil.sqlite.recovery` | Nur Admins: Lesen (enthält Notfall-Code, der als Passwort für account 'recovery' dient) |

---

## App auf Rechner deployen

### Portable EXE kopieren

Die Datei `Leistungsprofil-X.X.X-portable.exe` (wird vom Entwickler bereitgestellt) auf jeden Rechner kopieren, z.B.:

```
C:\Leistungsprofil\Leistungsprofil.exe
```

Anschließend eine Desktop-Verknüpfung anlegen. Kein Installer, keine Admin-Rechte nötig. Die App entpackt sich beim ersten Start selbst.

**Bei App-Updates:** Einfach die `.exe` ersetzen — alle Daten in `%APPDATA%\Leistungsprofil\` bleiben unverändert.

### Konfiguration per Skript vorbelegen (empfohlen)

Damit kein manueller Konfigurationsschritt durch den Nutzer nötig ist, kann die IT die Konfigurationsdatei per Rollout-Skript anlegen. Pfad: `%APPDATA%\Leistungsprofil\config.json`

Inhalt (Pfad anpassen):

```json
{
  "serverDbPath": "\\\\KLINIKSRV01\\Leistungsprofil\\leistungsprofil.sqlite"
}
```

Alternativ mit Laufwerksbuchstabe, falls dieser auf allen Rechnern gleich ist:

```json
{
  "serverDbPath": "G:\\Leistungsprofil\\leistungsprofil.sqlite"
}
```

---

## Erststart & Admin-Konfiguration

1. App starten
2. Im Ordner `%APPDATA%\Leistungsprofil\` liegt nach dem allerersten Start die Datei **`FIRST-RUN-CREDENTIALS.txt`** mit dem generierten Erstpasswort für den Admin-Account `IT`
3. Mit diesen Zugangsdaten einloggen
4. Sofort unter **Optionen → Benutzerverwaltung** ein eigenes Passwort setzen
5. `FIRST-RUN-CREDENTIALS.txt` löschen
6. Falls kein Rollout-Skript genutzt wurde: unter **Optionen → Server-Datenbankpfad** den Pfad zur Masterdatenbank eintragen und speichern
7. App neu starten — ab jetzt läuft der automatische Pull beim Start

---

## Täglicher Workflow für Nutzer

| Situation | Was tun |
|---|---|
| App starten | Kurzer Ladescreen (zieht aktuellen Stand vom Server), dann Login |
| Gelbe Warnung beim Start | Server war nicht erreichbar — App läuft mit letzter lokaler Kopie weiter |
| Nach Dateneingabe | „Synchronisieren"-Button klicken (leuchtet auf wenn Änderungen vorhanden) |
| Kollegen sollen den eigenen Stand sehen | Erst selbst synchronisieren — Kollege sieht es beim nächsten Klick auf „Aktualisieren" oder nach Neustart |
| „Nicht gespeichert"-Badge sichtbar | Lokale Änderungen noch nicht synchronisiert — vor dem nächsten Pull bitte erst synchronisieren |

---

## Fehlerszenarien

| Problem | Was passiert / Was tun |
|---|---|
| Server beim Start nicht erreichbar | Gelbe Warnung in der Menüleiste; App läuft mit letzter lokaler Kopie normal weiter |
| App abgestürzt ohne vorherigen Push | Lokale Kopie ist noch vorhanden; App erkennt beim nächsten Start ungespeicherte Änderungen und überspringt den Auto-Pull — zuerst manuell synchronisieren |
| Lokaler Ordner `%APPDATA%\Leistungsprofil\` versehentlich gelöscht | Kein Datenverlust — nächster Start zieht frischen Pull vom Server |
| Zwei Nutzer haben gleichzeitig denselben Patienten bearbeitet | Die zuletzt synchronisierte Version gewinnt; neu erstellte Einträge beider Nutzer bleiben immer erhalten |
| Nutzer hat Passwort vergessen | Admin kann unter Optionen → Benutzerverwaltung das Passwort zurücksetzen |

---

## Datenschutz & Sicherheit

- Alle Patientenfelder sind **AES-256-verschlüsselt**; der Schlüssel ist das Login-Passwort und existiert nur im Arbeitsspeicher während der Sitzung
- Abmelden löscht den Schlüssel sofort — die Datenbankdatei selbst bleibt verschlüsselt
- Kein Internetzugriff, keine Telemetrie, keine Cloud-Anbindung im Standardbetrieb
- Die `.recovery`-Datei enthält einen Notfall-Wiederherstellungscode — sicher verwahren, nur für Admins zugänglich machen

---

## Für Entwickler: Build-Anleitung

> Dieser Abschnitt ist nur für die Person relevant, die die App baut und neue Versionen der `.exe` erstellt.

### Voraussetzungen

- **Node.js 20+** — [nodejs.org](https://nodejs.org) (LTS)
- **Windows Build Tools** — werden für die Kompilierung der eingebetteten SQLite-Bibliothek benötigt. Einmalig als Administrator ausführen:

```powershell
npm install --global --production windows-build-tools
```

Falls das fehlschlägt: [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) installieren, Workload „Desktopentwicklung mit C++" auswählen.

### Erste Einrichtung

```bash
git clone https://github.com/MENKEP-Psych/Leistungsprofil.git
cd Leistungsprofil
npm install
npm run electron:rebuild
```

> **Wichtig:** `electron:rebuild` muss nach jedem `npm install` und nach jedem Node/Electron-Versions-Update ausgeführt werden. Wird dieser Schritt übersprungen, startet die App mit einer weißen Seite.

### Entwicklung

```bash
npm run electron:dev    # App mit Hot-Reload starten
```

### Portable EXE für Deployment bauen

```bash
npm run electron:build
```

Erzeugt in `release/`:

- `Leistungsprofil-X.X.X-portable.exe` — empfohlen für Deployment (kein Installer nötig)
- `Leistungsprofil Setup X.X.X.exe` — klassischer NSIS-Installer (braucht Admin-Rechte)


