import React from 'react';
import { Patient, PRResult } from '../types';
import { PRProfile, ProfileLegend, TextProfileResult } from './PRProfile';
import { formatDate } from '../lib/utils';

// Patient header reproduced as selectable vector text (ports drawHeader() from
// exportPDFScreenshot.ts). Rendered inside the repeating <thead>, so it appears
// at the top of every PDF page.
const PrintHeader: React.FC<{ patient: Patient }> = ({ patient }) => {
  const nameParts = patient.name.trim().split(' ');
  const lastName  = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(' ');

  const geschlechtLabel =
    patient.geschlecht === 'm' ? 'männlich' : patient.geschlecht === 'w' ? 'weiblich' : 'divers';

  const metaParts: string[] = [`* ${formatDate(patient.geburtsdatum)}`, geschlechtLabel];
  if (patient.aufnahmedatum) metaParts.push(`Aufnahme ${formatDate(patient.aufnahmedatum)}`);
  if (patient.entlassdatum)  metaParts.push(`Entlassung ${formatDate(patient.entlassdatum)}`);

  const diagnoseLabel = (patient.diagnose ?? [])
    .map(d => {
      const lok = patient.lokalisation?.[d];
      return lok ? `${d} (${lok})` : d;
    })
    .join('; ');

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-bold text-slate-900">
          {lastName}{firstName ? `, ${firstName}` : ''}
        </span>
        {diagnoseLabel && (
          <span className="text-[10px] text-slate-500 truncate max-w-[55%] text-right">
            {diagnoseLabel}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] text-slate-500">{metaParts.join('   ·   ')}</div>
      {patient.mitarbeiter && patient.mitarbeiter.length > 0 && (
        <div className="mt-1 text-[9px] text-slate-400">
          <span className="font-semibold">Mitarbeiter:innen</span>{'  '}
          {patient.mitarbeiter.join(', ')}
        </div>
      )}
    </div>
  );
};

interface PrintProfileProps {
  patient: Patient;
  profileData: PRResult[];
  textResults: TextProfileResult[];
  extraBottomContent: React.ReactNode;
}

/**
 * Print-optimised A4 report layout for the performance profile.
 *
 * Uses a single <table> whose <thead> (patient header + legend) is repeated on
 * every printed page by the browser's paged-media engine — this is the robust
 * way to get a repeating header that also reserves its own space (unlike
 * position:fixed). The profile body lives in one <tbody> cell; page numbers are
 * added separately via Electron's printToPDF footerTemplate.
 */
export const PrintProfile: React.FC<PrintProfileProps> = ({
  patient,
  profileData,
  textResults,
  extraBottomContent,
}) => (
  <table className="print-table">
    <thead className="print-runhead">
      <tr>
        <td>
          <div className="print-head-inner">
            <PrintHeader patient={patient} />
            <ProfileLegend className="mt-2 pt-2 border-t border-slate-200" printMode />
          </div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          {/* Flows as ordinary content (not the repeating thead), so it appears
              once, at the top of page 1 only. */}
          <h1 className="print-report-title">Neuropsychologisches Leistungsprofil</h1>
          {/* Die SD-/PR-Skala rendert PRProfile selbst in der Kopfzeile
              „Test | Prozentrang (PR)" — direkt unter dem Titel, wie am Bildschirm. */}
          <PRProfile
            results={profileData}
            textResults={textResults}
            extraBottomContent={extraBottomContent}
            hideLegend
            hideTrendArrows
            printMode
          />
        </td>
      </tr>
    </tbody>
  </table>
);
