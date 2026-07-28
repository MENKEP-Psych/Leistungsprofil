import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, User, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await login(username.trim(), password);
    if (ok) {
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  const inputCls = 'w-full bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl pl-9 pr-3 py-2.5 text-sm font-medium text-slate-900 dark:text-slate-100 shadow-sm shadow-slate-100 dark:shadow-none focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 focus:border-slate-400 dark:focus:border-slate-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-500';

  return (
    <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md shadow-slate-200/60 dark:shadow-none p-8"
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-slate-900 dark:bg-slate-100 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <ShieldCheck size={22} className="text-white dark:text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none mb-1">
              Klinik-Login
            </h1>
            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Neuropsychologische Testauswertung
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} data-enter-submit className="space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">
              Benutzername
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={14} className="text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className={inputCls}
                placeholder="Benutzername..."
                autoFocus
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-1">
              Passwort
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={14} className="text-slate-400 dark:text-slate-500" />
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Passwort eingeben..."
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 text-rose-500 bg-rose-50 dark:bg-rose-950/30 p-3 rounded-xl border border-rose-100 dark:border-rose-900"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span className="text-xs font-semibold">Ungültige Anmeldedaten. Bitte erneut versuchen.</span>
            </motion.div>
          )}

          <button
            type="submit"
            className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-white font-semibold py-2.5 rounded-xl shadow-sm shadow-slate-300/40 transition-all active:scale-[0.98] text-sm mt-2"
          >
            Anmelden
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              System bereit
            </span>
          </div>
          <span className="text-[10px] font-semibold text-slate-300 dark:text-slate-600 uppercase tracking-wider">
            v3.0.0
          </span>
        </div>
      </motion.div>
    </div>
  );
};
