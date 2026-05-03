import { useEffect, useRef } from 'react';

export function useShortcutSave(onSave: () => void) {
  const saved = useRef(onSave);
  useEffect(() => { saved.current = onSave; });

  useEffect(() => {
    const handler = () => saved.current();
    window.addEventListener('shortcut:save', handler);
    return () => window.removeEventListener('shortcut:save', handler);
  }, []);
}
