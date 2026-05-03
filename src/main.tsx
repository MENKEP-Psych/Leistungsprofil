import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
