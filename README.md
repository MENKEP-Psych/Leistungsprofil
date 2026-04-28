# Neuropsychologisches Leistungsprofil

Elektronische Dokumentation neuropsychologischer Testergebnisse für den klinischen Einsatz auf Windows-Rechnern (IGEL Thin Clients / lokale PCs). Die App läuft als **Electron-Desktop-App** vollständig lokal – inklusive einer eingebetteten SQLite-Datenbank – und synchronisiert sich auf Knopfdruck mit einer zentralen Masterdatenbank auf einem Netzlauf­werk.

---

## TL;DR

- **Was es ist:** Desktop-App (Electron + React) zur Erfassung und Auswertung neuropsychologischer Tests mit Normwerten (TMT, VLMT, ROCFT, TAP, TOL, VLMT, WMS, …)
- **Wie es funktioniert:** Jeder Rechner hat eine lokale Kopie der Datenbank. Beim Start wird automatisch der aktuelle Stand vom Server geholt (Pull). Beim Klick auf „Synchronisieren" werden eigene Änderungen zurückgespielt (Push). Kein dauerhaft laufender Dienst auf dem Server nötig.
- **Warum lokal statt Netzlaufwerk:** Windows blockiert das Ausführen nativer Module (`.node`-Dateien wie `better-sqlite3`) von Netzwerkpfaden. Außerdem ist SQLite nicht für gleichzeitige SMB-Schreibzugriffe ausgelegt.
- **Datenschutz:** Alle Patientendaten sind AES-256-verschlüsselt. Der Schlüssel ist das Login-Passwort und lebt nur im RAM – nie auf der Festplatte.
- **Deployment:** Portable `.exe` auf jeden Rechner kopieren, Pfad zur Masterdatenbank einmalig per Admin konfigurieren, fertig.

---

## Inhaltsverzeichnis

1. [Funktionen](#funktionen)
2. [Tech Stack](#tech-stack)
3. [Warum lokale App + Sync statt Netzlaufwerk](#warum-lokale-app--sync-statt-netzlaufwerk)
4. [Sync-System im Detail](#sync-system-im-detail)
5. [IT-Setup & Deployment](#it-setup--deployment)
6. [Erststart & Konfiguration](#erststart--konfiguration)
7. [Workflow für Anwender](#workflow-für-anwender)
8. [Entwicklung](#entwicklung)
9. [Sicherheit](#sicherheit)

---

## Funktionen

| Bereich | Details |
|---|---|
| **Patientenverwaltung** | Anlegen, bearbeiten, entlassen; Archiv für entlassene Fälle |
| **Tests** | TMT A/B, VLMT, ROCFT, TAP, TOL, WMS-IV, Zahlenspanne, ZZT, Mosaik, Logisches Gedächtnis, Neglect, Bürotest, Tagesplan, benutzerdefinierte Tests |
| **Leistungsprofil** | PR-Verlaufsdiagramm über alle Testdomänen mit Normzonen-Einfärbung |
| **Normen** | Alters- und/oder bildungsadjustierte Normtabellen für alle Tests eingebettet |
| **Verschlüsselung** | AES-256 für alle Patientenfelder; Schlüssel = Login-Passwort, nur im RAM |
| **Audit-Log** | Protokolliert Logins, Patientenaktionen, gespeicherte Tests (nur Admins) |
| **PDF-Export** | Leistungsprofil als druckbares PDF exportierbar |
| **Sync** | Automatischer Pull beim Start; manueller Push per Knopfdruck; Merge ohne Datenverlust bei mehreren gleichzeitigen Nutzern |
| **Benutzerverwaltung** | Admin kann Nutzer anlegen, Passwörter ändern, Rollen vergeben |

---

## Tech Stack

| Schicht | Technologie |
|---|---|
| **Framework** | Electron 41, React 19, TypeScript |
| **Build** | Vite 6, electron-builder |
| **UI** | Tailwind CSS 4, Lucide Icons, Recharts, Framer Motion |
| **Datenbank** | better-sqlite3 (eingebettet, lokal) |
| **Verschlüsselung** | CryptoJS (AES-256), bcryptjs (Passwort-Hashing) |
| **PDF** | jsPDF + jspdf-autotable |
| **Optional** | Firebase Firestore (nur wenn `firebase-applet-config.json` vorhanden) |

---

## Warum lokale App + Sync statt Netzlaufwerk

### Das Ausführungsproblem

Electron nutzt **Node.js** als Backend, und Node.js kann native Module laden – `.node`-Dateien, die als kompilierter C-Code direkt auf der CPU ausgeführt werden. `better-sqlite3` ist ein solches Modul.

**Windows blockiert die Ausführung von nativem Code aus Netzwerkpfaden** (Mark of the Web / Sicherheitszonen). Startet man die App von `G:\Leistungsprofil\`, lädt Electron das Fenster – aber sobald Node.js versucht, `better-sqlite3.node` vom Netzwerkpfad zu laden, bricht die App ab. Ergebnis: weißes Fenster oder sofortiger Absturz.

### Das SQLite-Locking-Problem

Selbst wenn man das Ausführungsproblem per Gruppenrichtlinie umgehen würde: SQLite nutzt POSIX-Datei-Locking, das auf SMB/CIFS-Netzwerkfreigaben **unzuverlässig** ist. WAL-Modus (der normalerweise mehrere gleichzeitige Leser erlaubt) benötigt eine Shared-Memory-Datei (`.shm`), die zwingend lokal sein muss. Ergebnis: `database is locked`-Fehler oder stille Datenkorruption bei gleichzeitiger Nutzung.

### Die gewählte Lösung: Lokaler Snapshot + Merge-Sync

```
Beim App-Start:
  Master-DB auf Server  →  lokale Kopie in %APPDATA%  →  App arbeitet lokal

Beim „Synchronisieren":
  lokale Änderungen  →  kurz auf Server  →  Merge in Master-DB  →  Verbindung zu
```

- Die App läuft lokal → kein Netzlaufwerk-Problem
- SQLite läuft lokal → kein SMB-Locking-Problem
- Masterdatenbank bleibt auf dem persistenten Server-Share
- Server braucht keinen dauerhaft laufenden Dienst

---

## Sync-System im Detail

### Pull (Beim Start / „Aktualisieren")

1. `fs.copyFileSync(serverDbPath, localDbPath)` – kopiert `master.sqlite` vom Share in `%APPDATA%\Leistungsprofil\`
2. `.key`-Datei (Verschlüsselungsschlüssel) wird mitgezogen
3. `pull_time` (Unix-Timestamp) wird lokal gespeichert
4. App arbeitet ab jetzt ausschließlich gegen die lokale Kopie

**Hinweis:** Dateien lesen und kopieren von Netzlaufwerken ist normales Datei-I/O und wird von Windows nicht blockiert – nur die *Ausführung* von Code ist eingeschränkt.

### Push (Manuelles „Synchronisieren")

1. Kurze direkte Verbindung zur Master-DB auf dem Server
2. `ATTACH` der lokalen DB als `local`
3. Merge-SQL in einer Transaktion:

```
Patienten neu (created_at >= pull_time)      →  INSERT OR IGNORE in Master
Patienten geändert (updated_at > server)     →  UPDATE in Master (kein REPLACE → kein Cascade-Delete)
Testergebnisse neu                           →  INSERT OR IGNORE
Testergebnisse geändert                      →  INSERT OR REPLACE
Neue Nutzer                                  →  INSERT OR IGNORE
Audit-Log-Einträge                           →  INSERT OR IGNORE
```

4. Verbindung wird sofort wieder geschlossen

### Merge-Garantien bei mehreren gleichzeitigen Nutzern

Wenn User A und User B beide einen Snapshot gezogen haben und unabhängig gearbeitet haben:

- A's neue Testergebnisse haben `created_at >= A's pull_time` → werden in Master eingefügt
- B's neue Testergebnisse haben eigene UUIDs → werden ebenfalls eingefügt, kein Konflikt
- Wenn beide denselben Patienten bearbeitet haben, gewinnt die zuletzt gespeicherte Version (`updated_at` Vergleich)
- Nichts wird implizit gelöscht

### Fehlerfälle

| Situation | Verhalten |
|---|---|
| Server beim Start nicht erreichbar | Gelbe Warnung in SyncBar; App läuft mit letzter lokaler Kopie weiter |
| App-Absturz ohne Push | Lokale Kopie bleibt; nächster Start erkennt ungespeicherte Änderungen, überspringt Auto-Pull |
| Vergessenes Synchronisieren | „Nicht gespeichert"-Badge in SyncBar; Auto-Pull wird übersprungen bis manuell synchronisiert |
| Lokale Kopie gelöscht | Nächster Start zieht frischen Pull vom Server |

---

## IT-Setup & Deployment

### Einmalige Server-Einrichtung

**1. Ordner auf persistenter Freigabe anlegen** (muss von Server-Rotation unberührt bleiben):

```
\\KLINIKSRV01\Leistungsprofil\
```

Alle IGEL-Nutzer benötigen **Lese- und Schreibrechte** auf diesen Ordner.

**2. Masterdatenbank initialisieren:**

App einmal lokal (ohne Server-Pfad) starten. Sie legt automatisch `leistungsprofil.sqlite`, `.key` und `.recovery` in `%APPDATA%\Leistungsprofil\` an. Diese drei Dateien auf den Server-Share kopieren.

**3. Dateiberechtigungen:**

| Datei | Berechtigung |
|---|---|
| `leistungsprofil.sqlite` | Alle IGEL-Nutzer: Lesen + Schreiben |
| `leistungsprofil.sqlite.key` | Alle IGEL-Nutzer: Lesen |
| `leistungsprofil.sqlite.recovery` | Nur Admins: Lesen |

### App auf IGEL-Rechner deployen

**Build erzeugen** (einmalig, auf einem Entwicklerrechner):

```bash
npm install
npm run electron:build
```

Erzeugt in `release/`:
- `Leistungsprofil Setup X.X.X.exe` – NSIS-Installer (braucht Admin-Rechte)
- `Leistungsprofil-X.X.X-portable.exe` – **empfohlen**: läuft ohne Installation, entpackt sich beim ersten Start nach `%LOCALAPPDATA%\leistungsprofil-portable-data\`

**Deployment der Portable-Version:**

1. `.exe` auf jeden Rechner kopieren (z.B. nach `C:\Leistungsprofil\Leistungsprofil.exe`)
2. Desktop-Verknüpfung anlegen

Für App-Updates nur die `.exe` ersetzen – Daten in `%APPDATA%` bleiben unberührt.

**Optional: Konfiguration per Skript vorbelegen**

Damit kein manueller Konfigurationsschritt nötig ist, kann die IT `%APPDATA%\Leistungsprofil\config.json` per Rollout-Skript anlegen:

```json
{
  "dbPath": "C:\\Users\\<USER>\\AppData\\Roaming\\Leistungsprofil\\leistungsprofil.sqlite",
  "serverDbPath": "G:\\Leistungsprofil\\leistungsprofil.sqlite"
}
```

(UNC-Pfad funktioniert ebenfalls: `\\\\KLINIKSRV01\\Leistungsprofil\\leistungsprofil.sqlite`)

---

## Erststart & Konfiguration

1. App starten → kurzer Ladescreen (erster Start ohne Server-Pfad, direkt bereit)
2. Im Verzeichnis der Datenbank (`%APPDATA%\Leistungsprofil\`) liegt nach dem ersten Start die Datei **`FIRST-RUN-CREDENTIALS.txt`** mit dem generierten Erststart-Passwort für den Admin-Account `IT`
3. Mit diesen Zugangsdaten einloggen
4. **Sofort** unter *Optionen → Benutzerverwaltung* eigenes Passwort setzen
5. `FIRST-RUN-CREDENTIALS.txt` anschließend löschen
6. Server-Pfad unter *Optionen → Server-Datenbankpfad* eintragen und speichern
7. App neu starten → ab jetzt automatischer Pull beim Start

---

## Workflow für Anwender

| Situation | Aktion |
|---|---|
| App starten | Ladescreen erscheint kurz (zieht Snapshot vom Server), dann Login |
| Server nicht erreichbar | Gelbe Warnung, App läuft mit letzter lokaler Kopie |
| Nach Dateneingabe | „Synchronisieren"-Button klicken (leuchtet auf, wenn Änderungen vorliegen) |
| Kollegen aktuellen Stand sehen lassen | Erst synchronisieren → Kollege klickt „Aktualisieren" |
| App-Update | Neue portable `.exe` ersetzen, Daten bleiben unverändert |

---

## Entwicklung

### Voraussetzungen

- Node.js 20+
- npm 10+
- Windows (für Electron-Build mit `better-sqlite3`)

### Befehle

```bash
npm install

# Web-Dev-Server (ohne Electron)
npm run dev

# Electron-Dev-Modus (mit Hot-Reload)
npm run electron:dev

# Produktions-Build (Installer + Portable)
npm run electron:build

# Native Module neu bauen (nach Node/Electron-Version-Wechsel)
npm run electron:rebuild

# TypeScript prüfen
npm run lint
```

### Projektstruktur

```
electron/
  main.ts        – Electron-Hauptprozess, Startup-Sequenz, IPC-Handler
  db.ts          – SQLite-Datenbankoperationen, Authentifizierung
  sync.ts        – Pull/Push-Sync-Engine
  preload.ts     – Context Bridge (IPC-API für den Renderer)

src/
  App.tsx        – Haupt-App-Shell, Ladescreen, SyncBar
  components/    – UI-Komponenten (Tests, Patienten, Admin, …)
  context/       – Auth, Firebase (optional), Theme
  hooks/         – Audit-Log, Benachrichtigungen, Patientendaten
  lib/           – DB-API, Verschlüsselung, PDF-Export, Normwert-Utils
  data/          – Normtabellen als JSON (alters-/bildungsadjustiert)
```

### Firebase (optional)

Wenn `firebase-applet-config.json` im Projektverzeichnis vorhanden ist, aktiviert sich die Firebase-Integration automatisch. Ohne diese Datei läuft die App vollständig lokal. Zugangsdaten **niemals** in den Quellcode einchecken – Vorlage: `.env.example`.

---

## Sicherheit

| Aspekt | Umsetzung |
|---|---|
| **Patientendaten** | AES-256 verschlüsselt; Schlüssel = Login-Passwort, nur im Session-RAM |
| **Abmelden** | Löscht den Schlüssel sofort – Daten bleiben verschlüsselt auf Disk |
| **Passwort-Hashing** | bcrypt mit Salt-Runden 10 |
| **Erststart-Passwort** | Zufällig generiert (96-bit Entropie), wird in `FIRST-RUN-CREDENTIALS.txt` neben die DB geschrieben und muss sofort geändert werden |
| **Audit-Log** | Alle relevanten Aktionen protokolliert, nur für Admins einsehbar |
| **Keine externen Dienste** | Keine Telemetrie, keine Cloud-Verbindung im Standardbetrieb |
| **DSGVO** | Verarbeitung ausschließlich im Klinik-Intranet; keine Daten verlassen das lokale Netzwerk |
| **Netzwerkfreigabe** | Nur die SQLite-Datei liegt auf dem Share (reines Datei-I/O, kein ausführbarer Code) |

### Was auf GitHub nicht committet werden darf

- `.env` (enthält ggf. Firebase-Credentials) – per `.gitignore` ausgeschlossen
- `firebase-applet-config.json` – muss manuell in `.gitignore` aufgenommen werden, falls genutzt
- `FIRST-RUN-CREDENTIALS.txt` – per `.gitignore` ausgeschlossen (s.u.)
- `*.sqlite`, `*.key`, `*.recovery` – Datenbankdateien mit Patientendaten

Empfohlener Eintrag in `.gitignore`:

```
firebase-applet-config.json
FIRST-RUN-CREDENTIALS.txt
*.sqlite
*.key
*.recovery
```
