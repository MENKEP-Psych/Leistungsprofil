import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Activity,
  ClipboardList,
  Loader2,
  Eye,
  Brain,
  FileText,
  CalendarDays,
  Zap,
  BookOpen,
  Timer,
  Grid2x2,
  Hash,
  ScrollText,
  PenLine,
  CheckCircle2,
  NotebookPen,
} from 'lucide-react';
import { getTestSymbolCounts } from './lib/testSummary';
import { usePatientData } from './hooks/usePatientData';
import { usePatients } from './hooks/usePatients';
import { PatientHeader } from './components/PatientHeader';
import { TMTTab } from './components/TMTTab';
import { VLMTTab } from './components/VLMTTab';
import { TOLTab } from './components/TOLTab';
import { BuerotestTab } from './components/BuerotestTab';
import { TagesplanTab } from './components/TagesplanTab';
import { NeglectTab } from './components/NeglectTab';
import { TAPTab } from './components/TAPTab';
import { WMSTab } from './components/WMSTab';
import { ZZTTab } from './components/ZZTTab';
import { ZZT_ENABLED } from './lib/featureFlags';
import { MosaikTab } from './components/MosaikTab';
import { ROCFTTab } from './components/ROCFTTab';
import { ZahlenspanneTab } from './components/ZahlenspanneTab';
import { BlockspanneTab } from './components/BlockspanneTab';
import { LGTab } from './components/LGTab';
import { LPSTab } from './components/LPSTab';
import { CustomTestTab } from './components/CustomTestTab';
import { BefundTab } from './components/BefundTab';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ProfileTab } from './components/ProfileTab';
import { AdminTab } from './components/AdminTab';
import { Login } from './components/Login';
import { PatientList } from './components/PatientList';
import { CreatePatientModal } from './components/CreatePatientModal';
import { EditPatientModal } from './components/EditPatientModal';
import { NotificationsTab } from './components/NotificationsTab';
import { useNotifications } from './hooks/useNotifications';
import { addNotification } from './lib/notifications';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FirebaseProvider } from './context/FirebaseContext';
import { ThemeProvider } from './context/ThemeContext';
import { NormOverridesProvider } from './context/NormOverridesContext';
import { ProfilePrefsProvider } from './context/ProfilePrefsContext';
import { cn } from './lib/utils';
import { dbGetStartupState, dbSyncGetServerPath, isElectron, dbDeletePatient } from './lib/db-api';

type TabType = 'patients' | 'profile' | 'tmt' | 'vlmt' | 'tol' | 'neglect' | 'tap' | 'wms' | 'admin' | 'custom' | 'buerotest' | 'tagesplan' | 'zzt' | 'mosaik' | 'rocft' | 'zahlenspanne' | 'blockspanne' | 'lg' | 'lps' | 'notifications' | 'befund';
const TEST_TABS_SET = new Set<TabType>(['tmt', 'zzt', 'tap', 'vlmt', 'wms', 'zahlenspanne', 'blockspanne', 'lg', 'mosaik', 'rocft', 'lps', 'tol', 'buerotest', 'tagesplan', 'neglect', 'custom', 'befund']);

// ── Startup loading gate ──────────────────────────────────────────────────────

function StartupLoader({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isElectron()) { setPhase('ready'); return; }

    let cancelled = false;
    const poll = async () => {
      try {
        const state = await dbGetStartupState();
        if (cancelled) return;
        setPhase(state.phase);
        setError(state.error ?? '');
        if (state.phase === 'loading') setTimeout(poll, 400);
      } catch {
        if (!cancelled) setTimeout(poll, 400);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  if (phase === 'loading') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 gap-4">
        <Loader2 size={36} className="animate-spin text-indigo-400" />
        <p className="text-sm font-semibold text-slate-400">Datenbank wird vorbereitet…</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 gap-4 px-8 text-center">
        <div className="text-red-400 text-4xl">✕</div>
        <p className="text-base font-black text-slate-100">Datenbank konnte nicht geöffnet werden</p>
        <p className="text-sm text-slate-400 max-w-md">{error}</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── Main app shell ────────────────────────────────────────────────────────────

function AppContent() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [serverPath, setServerPath] = useState('');
  const [startupWarning, setStartupWarning] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!isElectron()) return;
      const [sp, state] = await Promise.all([dbSyncGetServerPath(), dbGetStartupState()]);
      setServerPath(sp);
      setStartupWarning(state.warning ?? '');
    };
    load();
  }, []);

  const handleSyncComplete = useCallback(() => {
    window.dispatchEvent(new Event('patients_updated'));
  }, []);

  const {
    patient,
    previousResults,
    generalNote,
    isLoading,
    saveScore,
    saveGeneralNote,
    createPatient,
    updatePatient,
    updateResult,
    deleteResult,
    dischargePatient,
    undoDischarge,
  } = usePatientData(selectedId);

  const [activeTab, setActiveTab] = useState<TabType>('patients');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // ── Scroll-to-Top on tab change ───────────────────────────────────────────
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.scrollTo({ top: 0 }); }, [activeTab]);

  // ── Active tab ref (stable reference for event-handler closures) ──────────
  const activeTabRef = useRef<TabType>(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; });

  // ── Save toast ────────────────────────────────────────────────────────────
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const saveScoreWithToast = useCallback(async (...args: Parameters<typeof saveScore>) => {
    const result = await saveScore(...args);
    if (result) {
      isDirtyRef.current = false;
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastVisible(true);
      toastTimerRef.current = setTimeout(() => setToastVisible(false), 1800);
    }
    return result;
  }, [saveScore]);

  // ── Dirty-state guard ─────────────────────────────────────────────────────
  const isDirtyRef = useRef(false);
  const [pendingNav, setPendingNav] = useState<{ tab: TabType; patientId?: string | null } | null>(null);

  useEffect(() => {
    // Attach to `document` (always present) but only mark dirty for edits inside
    // <main>. Attaching to mainRef directly fails because on first mount the
    // login screen is shown and <main> doesn't exist yet, so the once-only
    // listener never gets added after login.
    const onEdit = (e: Event) => {
      if (mainRef.current?.contains(e.target as Node)) isDirtyRef.current = true;
    };
    document.addEventListener('input', onEdit);
    document.addEventListener('change', onEdit);
    return () => {
      document.removeEventListener('input', onEdit);
      document.removeEventListener('change', onEdit);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zusätzlich beim Schließen/Neuladen der App warnen, wenn im Test-Tab
  // ungespeicherte Eingaben vorliegen (der In-App-Wechsel ist über `navigate` abgesichert).
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current && TEST_TABS_SET.has(activeTabRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const navigate = useCallback((tab: TabType, patientId?: string | null) => {
    if (isDirtyRef.current && TEST_TABS_SET.has(activeTabRef.current)) {
      setPendingNav({ tab, patientId });
      return;
    }
    isDirtyRef.current = false;
    if (patientId !== undefined) setSelectedId(patientId);
    setActiveTab(tab);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmNav = useCallback((action: 'save' | 'discard' | 'cancel') => {
    if (!pendingNav) return;
    if (action === 'cancel') { setPendingNav(null); return; }
    const { tab, patientId } = pendingNav;
    setPendingNav(null);
    isDirtyRef.current = false;
    if (action === 'save') {
      window.dispatchEvent(new CustomEvent('shortcut:save'));
      setTimeout(() => {
        if (patientId !== undefined) setSelectedId(patientId);
        setActiveTab(tab);
      }, 150);
      return;
    }
    if (patientId !== undefined) setSelectedId(patientId);
    setActiveTab(tab);
  }, [pendingNav]);

  const goToPatients = useCallback(() => navigate('patients', null), [navigate]);
  const handleSelectPatient = useCallback((id: string) => navigate('profile', id), [navigate]);

  const { isAuthenticated, logout, currentUser, currentUserRole } = useAuth();
  const { patients: allPatients } = usePatients();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  const slashTimes  = useRef<number[]>([]);
  const starTimes   = useRef<number[]>([]);
  const TRIPLE_MS   = 600;

  const NAVIGABLE_TABS: TabType[] = (['profile', 'befund', 'tmt', 'zzt', 'vlmt', 'wms', 'zahlenspanne', 'blockspanne', 'lg', 'mosaik', 'rocft', 'lps', 'tol', 'buerotest', 'tagesplan', 'neglect', 'tap', 'custom'] as TabType[])
    .filter(t => ZZT_ENABLED || t !== 'zzt');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
        if (TEST_TABS_SET.has(activeTabRef.current) && selectedId) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('shortcut:save'));
        }
        return;
      }
      if (e.ctrlKey && e.key === '<') {
        e.preventDefault();
        if (selectedId) navigate('profile');
        return;
      }
      if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        goToPatients();
        return;
      }
      if (e.key === 'PageDown' && selectedId && !inInput) {
        const idx = NAVIGABLE_TABS.indexOf(activeTabRef.current);
        if (idx !== -1 && idx < NAVIGABLE_TABS.length - 1) {
          e.preventDefault();
          navigate(NAVIGABLE_TABS[idx + 1]);
        }
        return;
      }
      if (e.key === 'PageUp' && selectedId && !inInput) {
        const idx = NAVIGABLE_TABS.indexOf(activeTabRef.current);
        if (idx > 0) {
          e.preventDefault();
          navigate(NAVIGABLE_TABS[idx - 1]);
        }
        return;
      }
      if (e.key === '/' && !inInput && !e.ctrlKey && !e.metaKey) {
        const now = Date.now();
        slashTimes.current.push(now);
        if (slashTimes.current.length > 3) slashTimes.current.shift();
        if (slashTimes.current.length === 3 && now - slashTimes.current[0] < TRIPLE_MS && selectedId) {
          slashTimes.current = [];
          navigate('profile');
        }
        return;
      }
      if (e.key === '*' && !inInput && !e.ctrlKey && !e.metaKey) {
        const now = Date.now();
        starTimes.current.push(now);
        if (starTimes.current.length > 3) starTimes.current.shift();
        if (starTimes.current.length === 3 && now - starTimes.current[0] < TRIPLE_MS) {
          starTimes.current = [];
          goToPatients();
        }
        return;
      }
      if (e.key !== '/' && e.key !== '*') {
        slashTimes.current = [];
        starTimes.current  = [];
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  useEffect(() => {
    if (!currentUser) return;
    const now = new Date();
    const month = now.getMonth(); // 11 = Dezember
    const day = now.getDate();
    if (month !== 11 || day < 19 || day > 24) return;
    const year = now.getFullYear();
    const storageKey = `christmas_notification_shown_${year}_${currentUser}`;
    if (localStorage.getItem(storageKey)) return;
    addNotification(
      'Paul',
      currentUser,
      'Ich wünsche euch allen schon mal frohe Weihnachten und eine schöne Zeit :) Liebe Grüße, Paul 🎅',
      undefined,
      true
    );
    localStorage.setItem(storageKey, '1');
  }, [currentUser]);

  if (!isAuthenticated) return <Login />;

  const previousAdmissions = patient
    ? allPatients.filter(p =>
        p.id !== patient.id &&
        p.name.trim().toLowerCase() === patient.name.trim().toLowerCase() &&
        p.geburtsdatum === patient.geburtsdatum
      )
    : [];

  const handleDischarge = async () => {
    const success = await dischargePatient();
    if (success) goToPatients();
  };

  const handleUndoDischarge = async () => {
    await undoDischarge();
  };

  const handleDeletePatient = async () => {
    if (!selectedId) return;
    await dbDeletePatient(selectedId);
    goToPatients();
  };

  const handleExportPDF = () => {
    window.dispatchEvent(new CustomEvent('app:pdf-export'));
  };

  // Map sidebar tab IDs to test result testIds for PR symbol display
  const TAB_TO_TEST_ID: Record<string, string> = {
    tmt: 'tmt', tap: 'tap', zzt: 'zzt',
    vlmt: 'vlmt', wms: 'wms_vw', zahlenspanne: 'zahlenspanne', blockspanne: 'blockspanne', lg: 'lg',
    mosaik: 'mosaik', rocft: 'rey',
    lps: 'lps',
    tol: 'tol',
  };

  const domainGroups: {
    label: string | null;
    items: { id: string; label: string; icon: React.ElementType; disabled?: boolean }[];
  }[] = [
    {
      label: 'Dokumentation',
      items: [
        { id: 'befund', label: 'Befund schreiben', icon: NotebookPen, disabled: !selectedId },
      ],
    },
    {
      label: '1. Aufmerksamkeit',
      items: [
        { id: 'tmt', label: 'TMT A/B', icon: Activity, disabled: !selectedId },
        ...(ZZT_ENABLED ? [{ id: 'zzt', label: 'ZZT', icon: Timer, disabled: !selectedId }] : []),
      ],
    },
    {
      label: '2. Gedächtnis',
      items: [
        { id: 'vlmt', label: 'VLMT', icon: BookOpen, disabled: !selectedId },
        { id: 'wms', label: 'Vis. Wiedergabe', icon: Brain, disabled: !selectedId },
        { id: 'zahlenspanne', label: 'Zahlenspanne', icon: Hash, disabled: !selectedId },
        { id: 'blockspanne', label: 'Blockspanne', icon: Grid2x2, disabled: !selectedId },
        { id: 'lg', label: 'Log. Gedächtnis', icon: ScrollText, disabled: !selectedId },
      ],
    },
    {
      label: '3. Visuo-Perz. / Visuo-Konstr.',
      items: [
        { id: 'mosaik', label: 'Mosaik-Test', icon: Grid2x2, disabled: !selectedId },
        { id: 'rocft',  label: 'Rey-Figur (ROCFT)', icon: PenLine, disabled: !selectedId },
      ],
    },
    {
      label: '4. Intellektuelle Leistungen',
      items: [
        { id: 'lps', label: 'LPS', icon: Brain, disabled: !selectedId },
      ],
    },
    {
      label: '5. Exekutive Funktionen',
      items: [
        { id: 'tol', label: 'Turm von London', icon: ClipboardList, disabled: !selectedId },
        { id: 'buerotest', label: 'Bürotest', icon: FileText, disabled: !selectedId },
        { id: 'tagesplan', label: 'Tagesplan', icon: CalendarDays, disabled: !selectedId },
      ],
    },
    {
      label: '6. Exploration',
      items: [
        { id: 'neglect', label: 'Explorationsaufgaben', icon: Eye, disabled: !selectedId },
      ],
    },
    {
      label: 'TAP',
      items: [
        { id: 'tap', label: 'TAP', icon: Zap, disabled: !selectedId },
      ],
    },
    {
      label: 'Sonstige',
      items: [
        { id: 'custom', label: 'Eigener Test', icon: ClipboardList, disabled: !selectedId },
      ],
    },
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-100 dark:bg-slate-900 flex flex-col font-sans text-slate-900 dark:text-slate-100">
      {/* Always-visible app header */}
      <PatientHeader
        patient={patient ?? null}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'patients') navigate('patients', null);
          else navigate(tab as TabType);
        }}
        generalNote={generalNote}
        onSaveGeneralNote={saveGeneralNote}
        onExportPDF={patient ? handleExportPDF : undefined}
        onManagePatient={patient ? () => setIsEditModalOpen(true) : undefined}
        currentUser={currentUser}
        onLogout={logout}
        unreadCount={unreadCount}
        onShowNotifications={() => navigate('notifications')}
        previousAdmissions={previousAdmissions}
        onSelectPreviousPatient={(id) => navigate('profile', id)}
        serverPath={serverPath || undefined}
        startupWarning={startupWarning || undefined}
        onSyncComplete={handleSyncComplete}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <nav className="no-print w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-[1px_0_0_0_rgba(0,0,0,0.04)]">
          <div className="scrollbar-thin flex-1 overflow-y-auto py-2">
            {domainGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
                {group.label && (
                  <div className="px-4 pt-1 pb-1 text-[9px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-widest select-none">
                    {group.label}
                  </div>
                )}
                {group.items.map(tab => {
                  const testId = TAB_TO_TEST_ID[tab.id];
                  const counts = (testId && previousResults && previousResults.length > 0)
                    ? getTestSymbolCounts(testId, previousResults)
                    : null;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      disabled={tab.disabled}
                      onClick={() => navigate(tab.id as TabType)}
                      title={tab.disabled ? 'Bitte zuerst einen Patienten auswählen' : undefined}
                      className={cn(
                        'relative w-[calc(100%-8px)] mx-1 flex items-center gap-2.5 px-3 py-1.5 text-left rounded-lg transition-colors',
                        isActive
                          ? 'text-white dark:text-slate-900 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                        tab.disabled && 'opacity-35 cursor-not-allowed',
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute inset-0 bg-slate-800 rounded-lg"
                        />
                      )}
                      <tab.icon size={13} className="relative z-10 shrink-0" />
                      <span className="relative z-10 text-[13px] flex-1 truncate leading-snug">
                        {tab.label}
                      </span>
                      {counts && (counts.above > 0 || counts.average > 0 || counts.below > 0) && (
                        <span className="relative z-10 flex items-center gap-1 shrink-0">
                          {counts.above > 0 && (
                            <span className="text-[10px] font-semibold text-emerald-500 tabular-nums">
                              {counts.above}↑
                            </span>
                          )}
                          {counts.average > 0 && (
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">
                              {counts.average}−
                            </span>
                          )}
                          {counts.below > 0 && (
                            <span className="text-[10px] font-semibold text-rose-500 tabular-nums">
                              {counts.below}↓
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 overflow-y-auto p-8 bg-slate-100 dark:bg-slate-900">
          {isLoading && selectedId ? (
            <div className="flex items-center justify-center py-24 text-slate-400">
              <Loader2 className="animate-spin mr-3" size={32} />
              <span className="text-sm font-medium">Lade Patientendaten...</span>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab + (selectedId ?? '')}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="max-w-7xl mx-auto"
              >
                <ErrorBoundary key={activeTab + (selectedId ?? '')} label={activeTab}>
                {activeTab === 'patients' && (
                  <PatientList
                    onSelectPatient={handleSelectPatient}
                    onCreatePatient={() => setIsCreateModalOpen(true)}
                  />
                )}

                {activeTab === 'profile' && patient && (
                  <ProfileTab
                    patient={patient}
                    results={previousResults}
                    generalNote={generalNote}
                  />
                )}

                {activeTab === 'tmt' && patient && (
                  <TMTTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'neglect' && patient && (
                  <NeglectTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'tap' && patient && (
                  <TAPTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'admin' && <AdminTab />}

                {activeTab === 'vlmt' && patient && (
                  <VLMTTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'tol' && patient && (
                  <TOLTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'buerotest' && patient && (
                  <BuerotestTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'tagesplan' && patient && (
                  <TagesplanTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'wms' && patient && (
                  <WMSTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'lps' && patient && (
                  <LPSTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'custom' && patient && (
                  <CustomTestTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'zzt' && patient && (
                  <ZZTTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'mosaik' && patient && (
                  <MosaikTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'rocft' && patient && (
                  <ROCFTTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'zahlenspanne' && patient && (
                  <ZahlenspanneTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'blockspanne' && patient && (
                  <BlockspanneTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'lg' && patient && (
                  <LGTab patient={patient} previousResults={previousResults} onSave={saveScoreWithToast} onUpdate={updateResult} onDelete={deleteResult} />
                )}

                {activeTab === 'befund' && patient && (
                  <BefundTab patient={patient} previousResults={previousResults} />
                )}

                {activeTab === 'notifications' && (
                  <NotificationsTab
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onMarkAsRead={markAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onDelete={deleteNotification}
                  />
                )}
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* Modals */}
      <CreatePatientModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={createPatient}
      />
      <EditPatientModal
        isOpen={isEditModalOpen}
        patient={patient ?? null}
        onClose={() => setIsEditModalOpen(false)}
        onSave={updatePatient}
        onDischarge={patient?.status !== 'entlassen' ? handleDischarge : undefined}
        onUndoDischarge={patient?.status === 'entlassen' ? handleUndoDischarge : undefined}
        onDelete={currentUserRole === 'admin' ? handleDeletePatient : undefined}
        isAdmin={currentUserRole === 'admin'}
      />

      {/* Dirty-state navigation guard */}
      <AnimatePresence>
        {pendingNav && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => confirmNav('cancel')}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-80 mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-semibold text-slate-800 mb-1">Ungespeicherte Änderungen</p>
              <p className="text-xs text-slate-500 mb-5">Möchten Sie die Änderungen vor dem Wechsel speichern?</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => confirmNav('save')}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Speichern & wechseln
                </button>
                <button
                  onClick={() => confirmNav('discard')}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors"
                >
                  Verwerfen
                </button>
                <button
                  onClick={() => confirmNav('cancel')}
                  className="w-full py-2.5 px-4 text-slate-400 hover:text-slate-600 text-sm font-medium rounded-xl transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save toast */}
      <AnimatePresence>
        {toastVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="no-print fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-500 text-white text-sm font-semibold rounded-2xl shadow-xl pointer-events-none"
          >
            <CheckCircle2 size={16} />
            Gespeichert
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyboard shortcuts help — always visible, hover to show */}
      <div className="no-print fixed bottom-6 left-6 z-50 group">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-400 transition-colors text-xs font-bold shadow-sm"
          title="Tastaturkürzel"
          tabIndex={-1}
        >
          ?
        </button>
        <div className="absolute bottom-10 left-0 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 origin-bottom-left">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Tastaturkürzel</p>
          <div className="space-y-2">
            {([
              ['Ctrl + S', 'Test speichern'],
              ['Ctrl + <', 'Zum Leistungsprofil'],
              ['Ctrl + Y', 'Zur Patientenliste'],
              ['PageDown / PageUp', 'Test-Tabs navigieren'],
              ['/ / /', 'Zum Leistungsprofil'],
              ['* * *', 'Zur Patientenliste'],
            ] as [string, string][]).map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <code className="shrink-0 text-[10px] bg-slate-100 px-2 py-0.5 rounded-lg text-slate-600 font-mono">{key}</code>
                <span className="text-xs text-slate-500 text-right leading-tight">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FirebaseProvider>
        <AuthProvider>
          <ProfilePrefsProvider>
            <NormOverridesProvider>
              <StartupLoader>
                <AppContent />
              </StartupLoader>
            </NormOverridesProvider>
          </ProfilePrefsProvider>
        </AuthProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
