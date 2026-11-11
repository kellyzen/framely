'use client';

import type { ReactNode } from 'react';

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <div className="slider">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format ? format(value) : value}</output>
    </div>
  );
}

const PRESET_COLORS = [
  '#FFFFFF', '#111111', '#F7D6E0', '#E2557E', '#C2185B', '#FFD86B',
  '#D4B483', '#F3E9D2', '#B9E4C9', '#9BD4E4', '#7B5CFF', '#2A1B3D',
];

export function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="color-row" role="group" aria-label={label}>
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          aria-label={c}
          aria-pressed={value.toLowerCase() === c.toLowerCase()}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="color-input" title="Custom colour">
        <span className="sr-only">Custom colour</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </label>
    </div>
  );
}

export function Field({ label, hint, children }: { label?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="toggle">
      <span>
        <strong style={{ fontWeight: 600 }}>{label}</strong>
        {hint && <span className="hint" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
