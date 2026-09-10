import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// Schlanke, versprechen-basierte In-App-Rückfrage — Ersatz für `window.confirm`
// (das im Electron-Renderer das Fenster blockieren kann). Selbsttragend: mountet
// sich in einen eigenen Container an <body>, räumt sich nach der Antwort auf.

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Optische Betonung des Bestätigen-Buttons. */
  tone?: 'neutral' | 'danger';
}

const ConfirmModal: React.FC<{ opts: ConfirmOptions; onClose: (v: boolean) => void }> = ({ opts, onClose }) => {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Enter') { e.preventDefault(); onClose(true); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const danger = opts.tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm"
      onClick={() => onClose(false)}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl shadow-slate-900/20 p-6"
        onClick={e => e.stopPropagation()}
      >
        {opts.title && (
          <h2 className="text-sm font-bold text-slate-800 mb-1.5">{opts.title}</h2>
        )}
        <p className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{opts.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="py-2 px-4 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {opts.cancelLabel ?? 'Abbrechen'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onClose(true)}
            className={
              'py-2 px-4 rounded-xl text-xs font-semibold text-white transition-colors ' +
              (danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-700')
            }
          >
            {opts.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (v: boolean) => {
      root.unmount();
      host.remove();
      resolve(v);
    };
    root.render(<ConfirmModal opts={opts} onClose={close} />);
  });
}
