import React, { useState } from 'react';
import { ClipboardList, Check, CalendarCheck, Trash2, Pin } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { STANDARD_TESTS, REST_TESTS, isTestDone, labelForTestStatusId, TestStatusItem } from '../lib/testStatus';
import { cn } from '../lib/utils';
import { EndSessionModal } from './EndSessionModal';

interface TestStatusPanelProps {
  patient: Patient;
  results: TestResult[];
  onUpdatePatient: (updates: Partial<Pick<Patient, 'nextSessionNote' | 'nextSessionTestIds'>>) => Promise<boolean>;
}

function StatusGroup({ title, items, results }: { title: string; items: TestStatusItem[]; results: TestResult[] }) {
  return (
    <div>
      <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{title}</div>
      <div className="space-y-1">
        {items.map(item => {
          const done = isTestDone(item, results);
          // Offene Tests sollen ins Auge fallen, erledigte in den Hintergrund treten
          // ("die noch ausstehen highlighten, im Kontrast zu den ausgefadeten
          // gemachten Tests") — umgekehrt zur ursprünglichen "erledigt = grün"-Logik.
          return (
            <div key={item.id} className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] transition-colors',
              done
                ? 'opacity-40 text-slate-400 dark:text-slate-500'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100 font-semibold',
            )}>
              <span className={cn(
                'w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center',
                done
                  ? 'border-slate-300 dark:border-slate-600'
                  : 'border-slate-500 dark:border-slate-300',
              )}>
                {done && <Check size={8} className="text-slate-400 dark:text-slate-500" strokeWidth={3} />}
              </span>
              <span className="flex-1">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Rechte Sidebar im Leistungsprofil-Tab: Test-Status-Übersicht (erledigt/offen,
// direkt aus `results` abgeleitet) + "Sitzung beenden"-Workflow. Der zuletzt
// gespeicherte Plan (Notiz + geplante Tests) bleibt sticky sichtbar, bis er
// überschrieben, gelöscht wird oder der Patient entlassen ist.
export const TestStatusPanel: React.FC<TestStatusPanelProps> = ({ patient, results, onUpdatePatient }) => {
  const [modalOpen, setModalOpen] = useState(false);

  const plannedIds = patient.nextSessionTestIds ?? [];
  const hasPlan = patient.status !== 'entlassen'
    && (!!patient.nextSessionNote?.trim() || plannedIds.length > 0);

  const plannedLabels = plannedIds
    .map(labelForTestStatusId)
    .filter((l): l is string => !!l);

  const handleClear = () => {
    onUpdatePatient({ nextSessionNote: '', nextSessionTestIds: [] });
  };

  return (
    <div className="w-72 shrink-0 self-start sticky top-3 space-y-3">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <ClipboardList size={13} className="text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
            Test-Status
          </span>
        </div>
        <div className="space-y-3">
          <StatusGroup title="Standard" items={STANDARD_TESTS} results={results} />
          <StatusGroup title="Weitere" items={REST_TESTS} results={results} />
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[10px] font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white transition-colors"
        >
          <CalendarCheck size={12} /> Sitzung beenden
        </button>
      </div>

      {hasPlan && (
        <div className="bg-white dark:bg-slate-800 border-l-4 border-l-indigo-500 dark:border-l-indigo-400 border-y border-r border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Pin size={12} className="text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                Nächste Sitzung
              </span>
            </div>
            <button type="button" onClick={handleClear} title="Löschen"
              className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
          {plannedLabels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {plannedLabels.map(l => (
                <span key={l} className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-100">
                  {l}
                </span>
              ))}
            </div>
          )}
          {patient.nextSessionNote && (
            <p className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">{patient.nextSessionNote}</p>
          )}
        </div>
      )}

      <EndSessionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={onUpdatePatient}
        results={results}
      />
    </div>
  );
};
