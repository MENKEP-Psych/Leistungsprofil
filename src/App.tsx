import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Activity,
  Settings,
  ClipboardList,
  Loader2,
  LogOut,
  Users,
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
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { getTestSymbolCounts } from './lib/testSummary';
import { usePatientData } from './hooks/usePatientData';
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
import { MosaikTab } from './components/MosaikTab';
import { ROCFTTab } from './components/ROCFTTab';
import { ZahlenspanneTab } from './components/ZahlenspanneTab';
import { LGTab } from './components/LGTab';
import { CustomTestTab } from './components/CustomTestTab';
import { ProfileTab } from './components/ProfileTab';
import { AdminTab } from './components/AdminTab';
import { Login } from './components/Login';
import { PatientList } from './components/PatientList';
import { CreatePatientModal } from './components/CreatePatientModal';
import { EditPatientModal } from './components/EditPatientModal';
import { NotificationBell } from './components/NotificationBell';
import { NotificationsTab } from './components/NotificationsTab';
import { SyncBar } from './components/SyncBar';
import { useNotifications } from './hooks/useNotifications';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FirebaseProvider } from './context/FirebaseContext';
import { ThemeProvider } from './context/ThemeContext';
import { cn } from './lib/utils';
import { dbGetStartupState, dbSyncGetServerPath, isElectron } from './lib/db-api';

type TabType = 'patients' | 'profile' | 'tmt' | 'vlmt' | 'tol' | 'neglect' | 'tap' | 'wms' | 'admin' | 'custom' | 'buerotest' | 'tagesplan' | 'zzt' | 'mosaik' | 'rocft' | 'zahlenspanne' | 'lg' | 'notifications';

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
        if (state.phase === 'loading') {
          setTimeout(poll, 400);
        }
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
    // Trigger a patients list refresh after pull/push by dispatching the existing event.
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
  const { isAuthenticated, logout, currentUser } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();

  if (!isAuthenticated) return <Login />;

  const handleSelectPatient = (id: string) => {
    setSelectedId(id);
    setActiveTab('profile');
  };

  const handleDischarge = async () => {
    const success = await dischargePatient();
    if (success) {
      setSelectedId(null);
      setActiveTab('patients');
    }
  };

  // Map sidebar tab IDs to test result testIds for PR symbol display
  const TAB_TO_TEST_ID: Record<string, string> = {
    tmt: 'tmt', tap: 'tap', zzt: 'zzt',
    vlmt: 'vlmt', wms: 'wms_vw', zahlenspanne: 'zahlenspanne', lg: 'lg',
    mosaik: 'mosaik', rocft: 'rey',
    tol: 'tol',
  };

  const domainGroups: {
    label: string | null;
    items: { id: string; label: string; icon: React.ElementType; disabled?: boolean }[];
  }[] = [
    {
      label: null,
      items: [
        { id: 'patients', label: 'Patienten', icon: Users },
        { id: 'profile', label: 'Leistungsprofil', icon: LayoutDashboard, disabled: !selectedId },
      ],
    },
    {
      label: '1. Aufmerksamkeit',
      items: [
        { id: 'tmt', label: 'TMT A/B', icon: Activity, disabled: !selectedId },
        { id: 'tap', label: 'TAP', icon: Zap, disabled: !selectedId },
        { id: 'zzt', label: 'ZZT', icon: Timer, disabled: !selectedId },
      ],
    },
    {
      label: '2. Gedächtnis',
      items: [
        { id: 'vlmt', label: 'VLMT', icon: BookOpen, disabled: !selectedId },
        { id: 'wms', label: 'Vis. Wiedergabe', icon: Brain, disabled: !selectedId },
        { id: 'zahlenspanne', label: 'Zahlenspanne', icon: Hash, disabled: !selectedId },
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
      label: '5. Exekutive Funktionen',
      items: [
        { id: 'tol', label: 'Tower of London', icon: ClipboardList, disabled: !selectedId },
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
      label: 'Sonstige',
      items: [
        { id: 'custom', label: 'Eigener Test', icon: ClipboardList, disabled: !selectedId },
      ],
    },
  ];

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-slate-900 flex flex-col font-sans text-slate-900 dark:text-slate-100">
      {serverPath && (
        <SyncBar
          serverPath={serverPath}
          startupWarning={startupWarning}
          onSyncComplete={handleSyncComplete}
        />
      )}
      {patient && (
        <PatientHeader
          patient={patient}
          onEdit={() => setIsEditModalOpen(true)}
          onDischarge={handleDischarge}
          onUndoDischarge={undoDischarge}
          generalNote={generalNote}
          onSaveGeneralNote={saveGeneralNote}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <nav className="no-print w-64 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Sidebar Header: App-Titel + Benachrichtigungen-Bell */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-700 shrink-0">
            <span className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight">Leistungsprofil</span>
            <NotificationBell
              unreadCount={unreadCount}
              active={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              compact
            />
          </div>

          {/* Scrollbare Navigation */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-0">
            {domainGroups.map((group, gi) => (
              <div key={gi} className={gi > 0 ? 'mt-3' : ''}>
                {group.label && (
                  <div className="px-3 pt-1 pb-1 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {group.label}
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  {group.items.map(tab => (
                    <button
                      key={tab.id}
                      disabled={tab.disabled}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      title={tab.disabled ? 'Bitte zuerst einen Patienten auswählen' : undefined}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group',
                        activeTab === tab.id
                          ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200',
                        tab.disabled && 'opacity-40 cursor-not-allowed'
                      )}
                    >
                      <tab.icon
                        size={16}
                        className={cn(
                          activeTab === tab.id ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                        )}
                      />
                      <span className="flex-1 text-left">{tab.label}</span>
                      {(() => {
                        const testId = TAB_TO_TEST_ID[tab.id];
                        if (!testId || !previousResults || previousResults.length === 0) return null;
                        const counts = getTestSymbolCounts(testId, previousResults);
                        if (!counts) return null;
                        return (
                          <span className="flex items-center gap-1 ml-auto shrink-0">
                            {counts.above > 0 && (
                              <span className="flex items-center gap-0.5 text-emerald-500">
                                <TrendingUp size={11} />
                                <span className="text-[9px] font-black">({counts.above})</span>
                              </span>
                            )}
                            {counts.average > 0 && (
                              <span className="flex items-center gap-0.5 text-slate-400">
                                <Minus size={11} />
                                <span className="text-[9px] font-black">({counts.average})</span>
                              </span>
                            )}
                            {counts.below > 0 && (
                              <span className="flex items-center gap-0.5 text-rose-500">
                                <TrendingDown size={11} />
                                <span className="text-[9px] font-black">({counts.below})</span>
                              </span>
                            )}
                          </span>
                        );
                      })()}
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeTab"
                          className="absolute left-0 w-1 h-5 bg-indigo-600 rounded-r-full"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer: Optionen + User-Chip + Abmelden */}
          <div className="border-t border-slate-100 dark:border-slate-700 p-3 shrink-0">
            <button
              onClick={() => setActiveTab('admin')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all relative group mb-1',
                activeTab === 'admin'
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-slate-700 dark:hover:text-slate-200',
              )}
            >
              <Settings
                size={16}
                className={cn(activeTab === 'admin' ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')}
              />
              <span className="flex-1 text-left">Optionen</span>
              {activeTab === 'admin' && (
                <motion.div layoutId="activeTab" className="absolute left-0 w-1 h-5 bg-indigo-600 rounded-r-full" />
              )}
            </button>
            {currentUser && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center shrink-0">
                  <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                    {currentUser[0]?.toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none mb-0.5">Angemeldet</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{currentUser}</div>
                </div>
                <button
                  onClick={logout}
                  title="Abmelden"
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all shrink-0"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-50 dark:bg-slate-900">
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
                  <TMTTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'neglect' && patient && (
                  <NeglectTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'tap' && patient && (
                  <TAPTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'admin' && <AdminTab />}

                {activeTab === 'vlmt' && patient && (
                  <VLMTTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'tol' && patient && (
                  <TOLTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'buerotest' && patient && (
                  <BuerotestTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'tagesplan' && patient && (
                  <TagesplanTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'wms' && patient && (
                  <WMSTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'custom' && patient && (
                  <CustomTestTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'zzt' && patient && (
                  <ZZTTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'mosaik' && patient && (
                  <MosaikTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'rocft' && patient && (
                  <ROCFTTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'zahlenspanne' && patient && (
                  <ZahlenspanneTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
                )}

                {activeTab === 'lg' && patient && (
                  <LGTab
                    patient={patient}
                    previousResults={previousResults}
                    onSave={saveScore}
                    onUpdate={updateResult}
                    onDelete={deleteResult}
                  />
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
        patient={patient}
        onClose={() => setIsEditModalOpen(false)}
        onSave={updatePatient}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <FirebaseProvider>
        <AuthProvider>
          <StartupLoader>
            <AppContent />
          </StartupLoader>
        </AuthProvider>
      </FirebaseProvider>
    </ThemeProvider>
  );
}
