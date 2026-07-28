import { useEffect, useRef } from 'react';

export function useAutoFocusFirst<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    // Focus first interactive input, but skip date pickers (they open the native picker on focus)
    const input = ref.current?.querySelector<HTMLElement>(
      'input:not([type="date"]):not([disabled]), textarea:not([disabled])'
    );
    input?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
