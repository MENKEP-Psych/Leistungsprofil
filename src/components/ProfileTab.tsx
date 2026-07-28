import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Patient, TestResult } from '../types';
import { PRProfile } from './PRProfile';
import { Layers, CheckCircle, Loader2 } from 'lucide-react';
import { exportProfilePDFScreenshot } from '../lib/exportPDFScreenshot';
import { useProfileData } from '../hooks/useProfileData';
import { isElectron, dbExportProfilePdf } from '../lib/db-api';

interface ProfileTabProps {
  patient: Patient;
  results: TestResult[];
  generalNote: string;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  patient,
  results,
}) => {
  const [pdfSaveMsg, setPdfSaveMsg] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const exportHandlerRef = React.useRef<(() => void) | null>(null);
  const profileRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const listener = () => { exportHandlerRef.current?.(); };
    window.addEventListener('app:pdf-export', listener);
    return () => window.removeEventListener('app:pdf-export', listener);
  }, []);

  // Single source of truth for the profile data — shared with the PDF print layout.
  const { profileData, textResults, extraBottomContent } = useProfileData(patient, results);

  const handleExportPDF = async () => {
    flushSync(() => { setPdfSaveMsg(null); setPdfLoading(true); });
    try {
      // Dateiname: "Nachname, Vorname YYYY-MM-DD Leistungsprofil.pdf"
      const nameParts = patient.name.trim().split(' ');
      const lastName  = nameParts[nameParts.length - 1];
      const firstName = nameParts.slice(0, -1).join(' ');
      const dateStr   = new Date().toISOString().split('T')[0];
      const filename  = `${lastName}, ${firstName} ${dateStr} Leistungsprofil.pdf`;

      // Electron: print-optimiertes Vektor-PDF über den Main-Prozess (auswählbarer
      // Text, scharfe Linien, Legende auf jeder Seite). Web/Browser-Fallback: Screenshot.
      const result = isElectron()
        ? await dbExportProfilePdf(patient.id, filename)
        : (profileRef.current ? await exportProfilePDFScreenshot(profileRef.current, patient) : undefined);

      if (result && result.success && result.filePath) {
        setPdfSaveMsg(`Gespeichert in ${result.filePath}`);
        setTimeout(() => setPdfSaveMsg(null), 5000);
      }
    } finally {
      setPdfLoading(false);
    }
  };
  exportHandlerRef.current = handleExportPDF;

  return (
    <div className="space-y-8">
      {/* PDF toasts (fixed position) */}
      {pdfLoading && (
        <div className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-slate-700 dark:bg-slate-600 text-white text-xs font-semibold rounded-2xl shadow-xl">
          <Loader2 size={14} className="animate-spin" />
          <span>PDF wird erstellt …</span>
        </div>
      )}
      {pdfSaveMsg && (
        <div className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-2xl shadow-xl">
          <CheckCircle size={14} />
          <span className="font-mono">{pdfSaveMsg}</span>
        </div>
      )}

      {profileData.length === 0 && textResults.length === 0 && !extraBottomContent ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none p-16 text-center">
          <Layers size={48} strokeWidth={1} className="mx-auto mb-4 text-slate-200" />
          <h3 className="text-lg font-bold text-slate-600 dark:text-slate-300">Noch keine Testdaten</h3>
          <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
            Geben Sie Testergebnisse ein, um das Leistungsprofil zu sehen.
          </p>
        </div>
      ) : (
        <PRProfile results={profileData} textResults={textResults} extraBottomContent={extraBottomContent} containerRef={profileRef} />
      )}

    </div>
  );
};
