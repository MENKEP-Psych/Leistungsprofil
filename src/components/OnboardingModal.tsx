import React, { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import {
  ActiveTour, getActiveTour, markOnboardingDone, saveOnboardingStep,
} from '../lib/onboarding';

interface OnboardingModalProps {
  currentUser?: string | null;
  /** Die Tour setzt voraus, dass ihre Zielelemente aktuell im DOM sichtbar sind
   *  (ein Patient geöffnet, passender Tab aktiv) — der Aufrufer entscheidet, wann das der Fall ist. */
  canRun: boolean;
}

const PAD = 6;       // Abstand Spotlight-Rahmen zum Zielelement
const GAP = 14;       // Abstand Tooltip zum Spotlight-Rahmen
const TOOLTIP_W = 320;

function useTargetRect(targetId: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!active || !targetId) { setRect(null); return; }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(`[data-onboarding="${targetId}"]`);
      if (el) setRect(el.getBoundingClientRect());
      else raf = requestAnimationFrame(measure); // Ziel evtl. noch nicht gerendert
    };
    measure();
    const onResize = () => {
      const el = document.querySelector(`[data-onboarding="${targetId}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [targetId, active]);

  return rect;
}

// Liefert fixe CSS-Koordinaten für die Tooltip-Box. Nutzt bewusst nie eine
// unbekannte Tooltip-Höhe (die ist wegen `height: auto` erst nach dem Rendern
// bekannt) — vertikale Zentrierung bei links/rechts läuft über `translateY`,
// horizontale Zentrierung bei oben/unten über `translateX`; bei oben/unten
// wird über `bottom`/`top` verankert statt über eine berechnete Boxhöhe.
function tooltipStyle(rect: DOMRect, placement: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties {
  const vw = window.innerWidth, vh = window.innerHeight;
  const centerY = Math.max(80, Math.min(rect.top + rect.height / 2, vh - 80));

  if (placement === 'right') {
    const left = Math.min(rect.right + PAD + GAP, vw - TOOLTIP_W - 12);
    return { top: centerY, left, transform: 'translateY(-50%)' };
  }
  if (placement === 'left') {
    const left = Math.max(12, rect.left - PAD - GAP - TOOLTIP_W);
    return { top: centerY, left, transform: 'translateY(-50%)' };
  }
  const centerX = Math.max(12 + TOOLTIP_W / 2, Math.min(rect.left + rect.width / 2, vw - 12 - TOOLTIP_W / 2));
  if (placement === 'top') {
    return { bottom: vh - (rect.top - PAD - GAP), left: centerX, transform: 'translateX(-50%)' };
  }
  return { top: rect.bottom + PAD + GAP, left: centerX, transform: 'translateX(-50%)' };
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ currentUser, canRun }) => {
  const [tour, setTour] = useState<ActiveTour | null>(null);

  useEffect(() => {
    if (!currentUser || !canRun) { setTour(null); return; }
    setTour(getActiveTour(currentUser));
  }, [currentUser, canRun]);

  const step = tour?.entry.steps[tour.stepIndex];
  const rect = useTargetRect(step?.targetId, !!tour);

  if (!tour || !step) return null;
  const { entry, stepIndex } = tour;
  const isLast = stepIndex === entry.steps.length - 1;

  const advance = () => {
    if (!currentUser) return;
    if (isLast) {
      markOnboardingDone(currentUser, entry.id);
      setTour(null);
    } else {
      const nextIndex = stepIndex + 1;
      saveOnboardingStep(currentUser, entry.id, nextIndex);
      setTour({ entry, stepIndex: nextIndex });
    }
  };

  const closeEarly = () => {
    if (currentUser) saveOnboardingStep(currentUser, entry.id, stepIndex);
    setTour(null);
  };

  const spotlight = rect && {
    top: rect.top - PAD, left: rect.left - PAD,
    width: rect.width + PAD * 2, height: rect.height + PAD * 2,
  };
  const tooltipCss = rect ? tooltipStyle(rect, step.placement) : null;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[70]">
        {/* Abgedunkelter Hintergrund mit Aussparung ums Zielelement */}
        <svg className="fixed inset-0 w-full h-full pointer-events-none">
          <defs>
            <mask id="onboarding-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              {spotlight && (
                <rect x={spotlight.left} y={spotlight.top} width={spotlight.width} height={spotlight.height} rx={10} fill="black" />
              )}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(15,23,42,0.55)" mask="url(#onboarding-spotlight-mask)" />
        </svg>
        {/* Klick auf den abgedunkelten Bereich blockieren, damit die Tour nicht versehentlich die App bedient */}
        <div className="fixed inset-0" onClick={closeEarly} />

        {spotlight && (
          <div
            className="fixed rounded-[10px] pointer-events-none ring-2 ring-white shadow-[0_0_0_4px_rgba(99,102,241,0.55)]"
            style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
          />
        )}

        {/* Äußeres Element trägt die Positionierung (inkl. Zentrier-`transform`) —
            das innere motion.div animiert nur opacity/scale, damit sich beide
            `transform`-Zuweisungen nicht gegenseitig überschreiben. */}
        {tooltipCss && (
          <div className="fixed" style={{ ...tooltipCss, width: TOOLTIP_W }} onClick={e => e.stopPropagation()}>
            <motion.div
              key={`${entry.id}-${stepIndex}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.15 }}
              className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-sm font-bold text-slate-800 tracking-tight leading-snug">{step.title}</h3>
                <button onClick={closeEarly} className="p-1 -m-1 rounded-lg hover:bg-slate-100 text-slate-400 shrink-0">
                  <X size={15} />
                </button>
              </div>
              <p className="text-[13px] text-slate-600 leading-relaxed mb-4">{step.body}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-300 tracking-wide">
                  {stepIndex + 1} / {entry.steps.length}
                </span>
                <button
                  type="button"
                  onClick={advance}
                  className="py-1.5 px-3.5 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
                >
                  {isLast ? 'Fertig' : 'Weiter'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </AnimatePresence>,
    document.body
  );
};
