import React, { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { formatDate, calculateAge } from '../lib/utils';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { lookupLGWP, lookupLGWiedererkennung, wpToPR } from '../lib/normUtils';
import {
  PrBadge, TestMeta, NoteField, FormSave,
  PageHeader, HistoryHeader, EmptyHistory, HistoryRowActions,
} from './TestForm';

interface LGTabProps {
  patient: Patient;
  previousResults: TestResult[];
  onSave: (result: TestResult) => void;
  onUpdate: (result: TestResult) => void;
  onDelete: (id: string) => void;
}

export const LGTab: React.FC<LGTabProps> = ({ patient, previousResults, onSave, onUpdate, onDelete }) => {
  const { currentUser } = useAuth();
  const [rawLgI, setRawLgI] = useState('');
  const [rawLgII, setRawLgII] = useState('');
  const [rawWiedererk, setRawWiedererk] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [examiner, setExaminer] = useState(currentUser ?? '');
  const [lastSaved, setLastSaved] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const ageAtTest = calculateAge(patient.geburtsdatum, date);

  const results = previousResults
    .filter(r => r.testId === 'lg')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const lgIVal = rawLgI !== '' && !isNaN(Number(rawLgI)) ? Number(rawLgI) : null;
  const lgIIVal = rawLgII !== '' && !isNaN(Number(rawLgII)) ? Number(rawLgII) : null;
  const wiedererkVal = rawWiedererk !== '' && !isNaN(Number(rawWiedererk)) ? Number(rawWiedererk) : null;

  const wpLgI = lgIVal !== null ? lookupLGWP(lgIVal, ageAtTest, 'lgI') : null;
  const wpLgII = lgIIVal !== null ? lookupLGWP(lgIIVal, ageAtTest, 'lgII') : null;
  const prLgI = wpLgI !== null ? wpToPR(wpLgI) : null;
  const prLgII = wpLgII !== null ? wpToPR(wpLgII) : null;
  const prWiedererk = wiedererkVal !== null ? lookupLGWiedererkennung(wiedererkVal, ageAtTest) : null;

  const inputCls = cn(
    'w-full px-4 py-3 text-xl font-mono border-2 rounded-xl outline-none transition-all text-center',
    'border-slate-200 bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 focus:border-indigo-500',
  );

  const reset = () => {
    setRawLgI(''); setRawLgII(''); setRawWiedererk(''); setNote('');
    setDate(new Date().toISOString().split('T')[0]);
    setExaminer(currentUser ?? '');
  };

  const startEdit = (res: TestResult) => {
    setEditingId(res.id);
    setRawLgI(String(res.rawValues.lgI ?? ''));
    setRawLgII(String(res.rawValues.lgII ?? ''));
    setRawWiedererk(String(res.rawValues.wiedererk ?? ''));
    setDate(res.date);
    setExaminer(res.examiner ?? '');
    setNote(res.note ?? '');
  };

  const cancelEdit = () => { setEditingId(null); reset(); };

  const handleSave = () => {
    if (lgIVal === null && lgIIVal === null && wiedererkVal === null) return;

    const rawValues: Record<string, number | string> = {};
    if (lgIVal !== null) rawValues.lgI = lgIVal;
    if (lgIIVal !== null) rawValues.lgII = lgIIVal;
    if (wiedererkVal !== null) rawValues.wiedererk = wiedererkVal;

    const calcVals: Record<string, number> = {};
    if (wpLgI !== null) calcVals.wpLgI = wpLgI;
    if (wpLgII !== null) calcVals.wpLgII = wpLgII;

    const prs: Record<string, number | string> = {};
    if (prLgI !== null) prs.lgI = prLgI;
    if (prLgII !== null) prs.lgII = prLgII;
    if (prWiedererk !== null) prs.wiedererk = prWiedererk;

    const result: TestResult = {
      id: editingId ?? Date.now().toString(),
      testId: 'lg',
      date,
      examiner,
      note,
      rawValues,
      calculatedValues: calcVals,
      percentileRanks: prs,
      normInfo: 'WMS-R Logisches Gedächtnis [LG] – Normtabelle',
      domainMapping: {
        lgI: '2. Gedächtnis (Verbale Lern- und Merkfähigkeit)',
        lgII: '2. Gedächtnis (Verbale Lern- und Merkfähigkeit)',
        wiedererk: '2. Gedächtnis (Verbale Lern- und Merkfähigkeit)',
      },
    };

    if (editingId) { onUpdate(result); setEditingId(null); } else { onSave(result); }
    setLastSaved(true);
    setTimeout(() => setLastSaved(false), 3000);
    reset();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ScrollText size={22} />}
        title="Logisches Gedächtnis (LG)"
        subtitle={`Verbale Lern- und Merkfähigkeit (WMS-R) · Alter zum Testdatum: ${ageAtTest} J.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── INPUT ── */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <TestMeta date={date} onDate={setDate} examiner={examiner} onExaminer={setExaminer} />

            <div className="grid grid-cols-3 gap-4">
              {/* LG I */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  LG I – unmittelbar
                </label>
                <input
                  type="number"
                  value={rawLgI}
                  onChange={e => setRawLgI(e.target.value)}
                  className={inputCls}
                  placeholder="–"
                  min={0}
                  max={50}
                />
                {wpLgI !== null && prLgI !== null && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-400 text-center">WP {wpLgI}</div>
                    <div className="flex justify-center"><PrBadge value={prLgI} /></div>
                  </div>
                )}
              </div>

              {/* LG II */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  LG II – verzögert
                </label>
                <input
                  type="number"
                  value={rawLgII}
                  onChange={e => setRawLgII(e.target.value)}
                  className={inputCls}
                  placeholder="–"
                  min={0}
                  max={50}
                />
                {wpLgII !== null && prLgII !== null && (
                  <div className="space-y-0.5">
                    <div className="text-[10px] text-slate-400 text-center">WP {wpLgII}</div>
                    <div className="flex justify-center"><PrBadge value={prLgII} /></div>
                  </div>
                )}
              </div>

              {/* Wiedererkennung */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Wiedererkennung (0–30)
                </label>
                <input
                  type="number"
                  value={rawWiedererk}
                  onChange={e => setRawWiedererk(e.target.value)}
                  className={inputCls}
                  placeholder="–"
                  min={0}
                  max={30}
                />
                {prWiedererk !== null && (
                  <div className="flex justify-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-black">
                      PR {prWiedererk}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <NoteField value={note} onChange={setNote} />
            <FormSave onSave={handleSave} saved={lastSaved} editingId={editingId} onCancel={cancelEdit} />
          </div>

          <div className="px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-black text-slate-500 uppercase tracking-wider">Norm: </span>
            WMS-R Logisches Gedächtnis [LG] – Normtabelle
            <span className="block mt-1 italic">
              LG I / II: Rohwert → alterskorrigierter Wertpunkt (WP) → PR. Wiedererkennung: Rohwert → PR-Bereich.
            </span>
          </div>
        </div>

        {/* ── HISTORY ── */}
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="mb-4">
            <HistoryHeader count={results.length} />
          </div>

          {results.length === 0 ? <EmptyHistory /> : (
            <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-black uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-3 py-3 text-center">LG I</th>
                    <th className="px-3 py-3 text-center">PR I</th>
                    <th className="px-3 py-3 text-center">LG II</th>
                    <th className="px-3 py-3 text-center">PR II</th>
                    <th className="px-3 py-3 text-center">WE</th>
                    <th className="px-3 py-3 text-center">PR WE</th>
                    {patient.status !== 'entlassen' && <th className="px-2 py-3 w-16" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-700">
                  {results.map(res => (
                    <tr
                      key={res.id}
                      className={cn(
                        'hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors',
                        editingId === res.id && 'bg-indigo-50/60 dark:bg-indigo-900/30',
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">{formatDate(res.date)}</td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.lgI ?? '–'}</td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.lgI !== undefined ? <PrBadge value={res.percentileRanks.lgI} /> : <span className="text-slate-300">–</span>}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.lgII ?? '–'}</td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.lgII !== undefined ? <PrBadge value={res.percentileRanks.lgII} /> : <span className="text-slate-300">–</span>}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-slate-600 dark:text-slate-300">{res.rawValues.wiedererk ?? '–'}</td>
                      <td className="px-3 py-3 text-center">
                        {res.percentileRanks.wiedererk !== undefined
                          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-[10px] font-black">
                              {res.percentileRanks.wiedererk}
                            </span>
                          : <span className="text-slate-300">–</span>}
                      </td>
                      {patient.status !== 'entlassen' && (
                        <td className="px-2 py-3">
                          <HistoryRowActions
                            id={res.id}
                            editingId={editingId}
                            confirmDeleteId={confirmDeleteId}
                            patientDischarged={false}
                            onEdit={() => { setConfirmDeleteId(null); editingId === res.id ? cancelEdit() : startEdit(res); }}
                            onDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            onConfirmDelete={() => { onDelete(res.id); setConfirmDeleteId(null); }}
                            onSetConfirm={() => { setConfirmDeleteId(res.id); setEditingId(null); }}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
