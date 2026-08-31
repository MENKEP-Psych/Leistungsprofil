// Zentrale Feature-Schalter.
//
// ZZT (Zahlen-Zeige-Test) ist auf Wunsch der Klinik überall ausgeblendet.
// Die Logik (src/components/ZZTTab.tsx, lookupZZT in normUtils, recalcZZT) und die
// Normen (src/data/zzt_normen.json) bleiben vollständig erhalten – nur die sichtbaren
// Oberflächen (Navigation, Profil, Befund, Normen-Verifizieren) sind ausgeblendet.
//
// Zum Wieder-Einblenden einfach auf `true` setzen – es sind keine weiteren Änderungen nötig.
export const ZZT_ENABLED = false;

// ─────────────────────────────────────────────────────────────────────────────
// PDF Experimental
// ─────────────────────────────────────────────────────────────────────────────
// Zusätzlicher PDF-Export-Button ("PDF Exp.") neben dem regulären PDF-Button in
// der Kopfleiste. Er erzeugt inhaltlich dasselbe Leistungsprofil-PDF wie der
// reguläre Export, läuft aber über eine KOMPLETT EIGENE, abgekoppelte Kopie der
// Export-Pipeline. Zweck: die PDF-Darstellung (Layout, Kommentar-Platzierung,
// Seitenränder …) frei umbauen zu können, ohne den produktiven PDF-Export zu
// gefährden.
//
// Die experimentelle Pipeline besteht aus diesen eigenen Dateien:
//   • src/components/PrintProfileExperimental.tsx      (Kopie von PrintProfile.tsx)
//   • src/components/PrintProfileAppExperimental.tsx   (Kopie von PrintProfileApp.tsx)
//   • src/print-experimental.css                       (Kopie von print.css)
// und diesen abgekoppelten Kanälen (jeweils Suffix "Experimental" / "-experimental"):
//   • IPC-Handler   'pdf:exportProfileExperimental'    (electron/main.ts)
//   • Preload-API   exportProfilePdfExperimental       (electron/preload.ts, ipc-types.ts)
//   • db-api        dbExportProfilePdfExperimental     (src/lib/db-api.ts)
//   • Fenster-Event 'app:pdf-export-experimental'      (App.tsx → ProfileTab.tsx)
//   • URL-Marker    ?print=exp                         (src/main.tsx)
// Der reguläre Pfad (pdf:exportProfile, PrintProfile.tsx, print.css, ?print=1,
// der "PDF"-Button) wird davon NICHT berührt und bleibt unverändert.
//
// Die experimentelle Datei erhält den Dateinamens-Zusatz "(Experimentell)".
// Nur in der Desktop-App (Electron) verfügbar – kein Screenshot-Fallback.
//
// Für Release-Builds ohne den Button einfach auf `false` setzen – es sind keine
// weiteren Änderungen nötig, der reguläre Export bleibt in jedem Fall aktiv.
export const PDF_EXPERIMENTAL_ENABLED = false;
