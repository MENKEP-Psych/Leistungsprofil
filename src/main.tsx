import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

// ── Print mode ────────────────────────────────────────────────────────────────
// The hidden PDF-export window loads the app with `?print=1&patient=<id>`. In
// that case we render only the standalone print layout (no login / app chrome)
// and load the print stylesheet first so it is applied before the first paint.
const params = new URLSearchParams(window.location.search);
const printPatientId = params.get('print') === '1' ? params.get('patient') : null;

if (printPatientId) {
  Promise.all([
    import('./print.css'),
    import('./components/PrintProfileApp'),
  ]).then(([, mod]) => {
    createRoot(document.getElementById('root')!).render(
      <mod.PrintProfileApp patientId={printPatientId} />,
    );
  });
} else {
  // Lazy-load the full app so the hidden print window above never pulls App's
  // heavy module graph (motion, firebase, all test tabs) — keeps PDF export fast.
  // Global Enter → Tab behaviour for all plain <input> fields.
  // Local onKeyDown handlers fire before this (bubble phase), so if they already
  // moved focus (e.g. via focusNext()), document.activeElement differs from the
  // event target and we skip the advancement — preventing double-moves.
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const el = e.target as HTMLElement;
    if (el.tagName !== 'INPUT') return;
    const input = el as HTMLInputElement;
    if (['submit', 'reset', 'checkbox', 'radio', 'button'].includes(input.type)) return;
    // Let Enter submit forms that opt in via data-enter-submit (e.g. login form)
    if (input.closest('form[data-enter-submit]')) return;
    e.preventDefault(); // always block form-submit on Enter for regular inputs
    if (document.activeElement !== el) return; // local handler already moved focus
    const focusable = Array.from(
      document.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]):not([readonly]), ' +
        'select:not([disabled]), button:not([disabled]), textarea:not([disabled])'
      )
    ).filter(f => {
      const s = getComputedStyle(f);
      return s.display !== 'none' && s.visibility !== 'hidden';
    });
    const idx = focusable.indexOf(el);
    if (idx !== -1 && idx < focusable.length - 1) focusable[idx + 1].focus();
  });

  import('./App.tsx').then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
