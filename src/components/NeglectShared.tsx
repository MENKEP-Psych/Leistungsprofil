/**
 * Shared types, utilities, and display components for the Neglect/GF tab
 * and the Leistungsprofil summary.
 */

import React from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

// [UL, UR, LL, LR, center]
export type QuadValues = [string, string, string, string, string];

export interface FieldEntry {
  ml: string;
  mr: string;
  mq: QuadValues; // M graphic (cross)
  aq: QuadValues; // A graphic (circle)
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export const emptyQuad = (): QuadValues => ['', '', '', '', ''];
export const emptyField = (): FieldEntry => ({ ml: '', mr: '', mq: emptyQuad(), aq: emptyQuad() });

export const encodeQuad = (q: QuadValues): string => q.join(',');

export const decodeQuad = (s: string | number | undefined): QuadValues => {
  const parts = String(s ?? '').split(',');
  return [
    parts[0] ?? '', parts[1] ?? '', parts[2] ?? '',
    parts[3] ?? '', parts[4] ?? '',
  ] as QuadValues;
};

export const encodeField = (f: FieldEntry, prefix: string): Record<string, string> => ({
  [`${prefix}_ml`]: f.ml,
  [`${prefix}_mr`]: f.mr,
  [`${prefix}_mq`]: encodeQuad(f.mq),
  [`${prefix}_aq`]: encodeQuad(f.aq),
});

export const decodeField = (raw: Record<string, number | string>, prefix: string): FieldEntry => ({
  ml: String(raw[`${prefix}_ml`] ?? ''),
  mr: String(raw[`${prefix}_mr`] ?? ''),
  mq: decodeQuad(raw[`${prefix}_mq`]),
  aq: decodeQuad(raw[`${prefix}_aq`]),
});

export function hasFieldData(raw: Record<string, number | string>, prefix: string): boolean {
  return ['_ml', '_mr', '_mq', '_aq'].some(suffix => {
    const v = String(raw[`${prefix}${suffix}`] ?? '');
    return v !== '' && v.replace(/[,0]/g, '') !== '';
  });
}

// ── QuadGrid ──────────────────────────────────────────────────────────────────
//
// 'cross' : plain crosshair, center input at intersection
// 'circle': circle at center, arms extend OUTSIDE the circle only,
//           center input sits inside the circle

export const QuadGrid: React.FC<{
  value: QuadValues;
  onChange?: (q: QuadValues) => void;
  shape: 'cross' | 'circle';
  disabled?: boolean;
}> = ({ value, onChange, shape, disabled }) => {
  const SIZE = 104;
  const HALF = SIZE / 2;
  const R = 19;
  const LINE = '#64748b';
  const INPUT_W = 26;

  const outerOffset = HALF / 2 - INPUT_W / 2; // ~13
  const centerOffset = HALF - INPUT_W / 2;     // ~39

  const positions: Array<React.CSSProperties> = [
    { top: outerOffset,    left:  outerOffset  }, // UL
    { top: outerOffset,    right: outerOffset  }, // UR
    { bottom: outerOffset, left:  outerOffset  }, // LL
    { bottom: outerOffset, right: outerOffset  }, // LR
    { top: centerOffset,   left:  centerOffset }, // center
  ];

  // Fail buttons positioned at the outer corners of each quadrant (not for center)
  const failBtnPos: Array<React.CSSProperties> = [
    { top: 2,    left:  2  }, // UL
    { top: 2,    right: 2  }, // UR
    { bottom: 2, left:  2  }, // LL
    { bottom: 2, right: 2  }, // LR
  ];

  const update = (i: number, v: string) => {
    if (!onChange) return;
    const next = [...value] as QuadValues;
    next[i] = v.replace(/[^0-9]/g, '').slice(0, 2);
    onChange(next);
  };

  const toggleFail = (i: number) => {
    if (!onChange) return;
    const next = [...value] as QuadValues;
    next[i] = next[i] === '/' ? '' : '/';
    onChange(next);
  };

  return (
    <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
      {value.map((v, i) => (
        <React.Fragment key={i}>
          <input
            type="text"
            inputMode="numeric"
            value={v}
            onChange={e => update(i, e.target.value)}
            disabled={disabled || v === '/'}
            readOnly={!onChange}
            maxLength={2}
            style={{
              position: 'absolute',
              ...positions[i],
              width: INPUT_W,
              height: INPUT_W,
              border: v === '/' ? '1px solid #fca5a5' : 'none',
              borderRadius: v === '/' ? 3 : 0,
              background: v === '/'
                ? '#fee2e2'
                : (i === 4 && shape === 'cross') ? 'white' : 'transparent',
              textAlign: 'center',
              fontSize: v === '/' ? 14 : 12,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: v === '/' ? '#dc2626' : v ? '#dc2626' : '#94a3b8',
              outline: 'none',
              padding: 0,
              cursor: disabled ? 'default' : v === '/' ? 'default' : 'text',
              zIndex: 2,
            }}
          />
          {/* Red X fail-toggle button for each quadrant (not center) */}
          {i < 4 && !disabled && onChange && (
            <button
              type="button"
              onClick={() => toggleFail(i)}
              title={v === '/' ? 'Entfernen' : 'Als Ausfall markieren (/)'}
              style={{
                position: 'absolute',
                ...failBtnPos[i],
                width: 11,
                height: 11,
                background: v === '/' ? '#ef4444' : '#fca5a5',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                fontSize: 8,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 4,
                padding: 0,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </React.Fragment>
      ))}

      <svg
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
        width={SIZE}
        height={SIZE}
      >
        {shape === 'cross' ? (
          <>
            <line x1={0}    y1={HALF} x2={SIZE} y2={HALF} stroke={LINE} strokeWidth={1.5} />
            <line x1={HALF} y1={0}    x2={HALF} y2={SIZE} stroke={LINE} strokeWidth={1.5} />
          </>
        ) : (
          <>
            <circle cx={HALF} cy={HALF} r={R} stroke={LINE} strokeWidth={1.5} fill="white" />
            <line x1={HALF}      y1={0}        x2={HALF}      y2={HALF - R} stroke={LINE} strokeWidth={1.5} />
            <line x1={HALF}      y1={HALF + R} x2={HALF}      y2={SIZE}     stroke={LINE} strokeWidth={1.5} />
            <line x1={0}         y1={HALF}     x2={HALF - R}  y2={HALF}     stroke={LINE} strokeWidth={1.5} />
            <line x1={HALF + R}  y1={HALF}     x2={SIZE}      y2={HALF}     stroke={LINE} strokeWidth={1.5} />
          </>
        )}
      </svg>
    </div>
  );
};

// ── FieldSection ──────────────────────────────────────────────────────────────

export const FieldSection: React.FC<{
  value: FieldEntry;
  onChange?: (f: FieldEntry) => void;
  disabled?: boolean;
}> = ({ value, onChange, disabled }) => {
  const upd = <K extends keyof FieldEntry>(k: K, v: FieldEntry[K]) =>
    onChange?.({ ...value, [k]: v });

  const msInput = (val: string, setter: (v: string) => void, label: React.ReactNode) => (
    <div className="flex items-center gap-1">
      <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">{label}</span>
      <span className="text-[11px] font-bold text-slate-600">=</span>
      <div className="border border-slate-300 rounded px-1.5 py-0.5 flex items-center gap-1 bg-white">
        <input
          type="text"
          inputMode="numeric"
          value={val}
          onChange={e => setter(e.target.value.replace(/[^0-9]/g, ''))}
          disabled={disabled}
          readOnly={!onChange}
          placeholder="—"
          className="w-12 text-[11px] font-mono text-center outline-none bg-transparent disabled:text-slate-400"
        />
        <span className="text-[10px] text-slate-400">ms</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {msInput(value.ml, v => upd('ml', v), <span>M<sub>L</sub></span>)}
        {msInput(value.mr, v => upd('mr', v), <span>M<sub>R</sub></span>)}
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600">M</span>
          <div className="w-3 h-px bg-slate-400" />
          <QuadGrid value={value.mq} onChange={onChange ? q => upd('mq', q) : undefined} shape="cross" disabled={disabled} />
          <div className="w-3 h-px bg-slate-400" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-slate-600">A</span>
          <div className="w-3 h-px bg-slate-400" />
          <QuadGrid value={value.aq} onChange={onChange ? q => upd('aq', q) : undefined} shape="circle" disabled={disabled} />
          <div className="w-3 h-px bg-slate-400" />
        </div>
      </div>
    </div>
  );
};
