import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CalendarCheck, X, Loader2, Check } from 'lucide-react';
import { Patient, TestResult } from '../types';
import { STANDARD_TESTS, REST_TESTS, TestStatusItem, isTestDone } from '../lib/testStatus';
import { cn } from '../lib/utils';

interface EndSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<Pick<Patient, 'nextSessionNote' | 'nextSessionTestIds'>>) => Promise<boolean>;
  results: TestResult[];
}

// Wie in der Sidebar: erledigte Tests ausgefadet, offene hervorgehoben — hier
// zusätzlich als dritte Dimension die eigentliche Checkbox-Auswahl, die (egal ob
// erledigt oder offen) immer klar erkennbar bleibt.
function CheckboxGroup({ title, items, results, selected, onToggle }: {
  title: string; items: TestStatusItem[]; results: TestResult[]; selected: Set<string>; onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1 mb-1.5">{title}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {items.map(item => {
          const done = isTestDone(item, results);
          const isSelected = selected.has(item.id);
          return (
            <label key={item.id} className={cn(
              'flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border cursor-pointer transition-colors',
              isSelected
                ? 'bg-slate-900 text-white border-slate-900'
                : done
                ? 'bg-white text-slate-400 border-slate-100 opacity-60 hover:opacity-100 hover:border-slate-300'
                : 'bg-slate-100 text-slate-700 border-slate-200 font-semibold hover:border-slate-400',
            )}>
              <input
                type="checkbox"
                className="sr-only"
                checked={isSelected}
                onChange={() => onToggle(item.id)}
              />
              <span className="flex-1">{item.label}</span>
              {done && <Check size={11} className={isSelected ? 'text-white/70' : 'text-slate-300'} strokeWidth={3} />}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// "Sitzung beenden": Auswahl der für die nächste Sitzung geplanten Tests + Notiz.
// Startet bei jedem Öffnen bewusst leer (keine Vorauswahl offener Tests) und
// überschreibt beim Speichern den kompletten bisherigen Plan des Patienten.
export const EndSessionModal: React.FC<EndSessionModalProps> = ({ isOpen, onClose, onSave, results }) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelected(new Set());
      setNote('');
    }
  }, [isOpen]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onSave({ nextSessionNote: note, nextSessionTestIds: [...selected] });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Per Portal direkt an document.body rendern: der Aufrufer (TestStatusPanel) sitzt
  // tief verschachtelt innerhalb eines animierten `motion.div` (App.tsx) — dieses
  // erhält durch die y-Animation ein `transform` und wird dadurch zum Containing
  // Block für `position: fixed`-Nachfahren, was das Overlay auf den Bereich dieses
  // Divs beschränken und vom Leistungsprofil-Inhalt überlagert erscheinen lassen
  // würde. Ein Portal umgeht das zuverlässig, unabhängig davon, wo die Komponente
  // im Baum gemountet ist (wie es EditPatientModal/CreatePatientModal an der
  // App-Wurzel ohnehin automatisch tun).
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl shadow-slate-900/15 overflow-hidden max-h-[90vh] flex flex-col"
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                  <CalendarCheck size={16} />
                </div>
                <h2 className="text-base font-bold text-slate-800 tracking-tight">Sitzung beenden</h2>
              </div>
              <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <p className="text-xs text-slate-500 mb-3">Welche Tests sind für die nächste Sitzung geplant?</p>
                <div className="space-y-3">
                  <CheckboxGroup title="Standard" items={STANDARD_TESTS} results={results} selected={selected} onToggle={toggle} />
                  <CheckboxGroup title="Weitere" items={REST_TESTS} results={results} selected={selected} onToggle={toggle} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">Notiz</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={3}
                  placeholder="Besonderheiten, Hinweise für nächstes Mal…"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:ring-2 focus:ring-slate-400/20 focus:border-slate-400 transition-all outline-none resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button type="button" onClick={onClose}
                className="py-2 px-4 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Abbrechen
              </button>
              <button type="button" onClick={handleSave} disabled={isSubmitting}
                className="py-2 px-4 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-700 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                {isSubmitting ? <Loader2 size={13} className="animate-spin" /> : 'Speichern'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
