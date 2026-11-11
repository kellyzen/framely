'use client';

import { useRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Placeable } from '@/lib/types';

type Patch = Partial<Pick<Placeable, 'x' | 'y' | 'size' | 'rot'>>;

interface Props<T extends Placeable> {
  items: T[];
  selectedId: string | null;
  editable: boolean;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Patch) => void;
  /** Size/shape of the item box (the position + rotation are handled here). */
  itemStyle: (item: T) => CSSProperties;
  renderItem: (item: T) => ReactNode;
  allowOverflow?: boolean;
  minSize?: number;
  maxSize?: number;
}

type Gesture =
  | { mode: 'move'; id: string; sx: number; sy: number; x: number; y: number }
  | { mode: 'handle'; id: string; cx: number; cy: number; dist: number; angle: number; size: number; rot: number }
  | { mode: 'pinch'; id: string; dist: number; angle: number; size: number; rot: number };

/**
 * Lets you drag items (one finger / mouse), resize + rotate them with the corner handle,
 * or pinch with two fingers. Positions are stored as fractions so they work at any screen size.
 */
export default function Transformable<T extends Placeable>(p: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const minSize = p.minSize ?? 0.03;
  const maxSize = p.maxSize ?? 3;

  const clampSize = (v: number) => Math.min(maxSize, Math.max(minSize, v));
  const find = (id: string) => p.items.find((i) => i.id === id);

  function startPinch() {
    const id = p.selectedId;
    const item = id ? find(id) : undefined;
    const pts = [...pointers.current.values()];
    if (!item || pts.length < 2) return;
    const [a, b] = pts;
    gesture.current = {
      mode: 'pinch',
      id: item.id,
      dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      size: item.size,
      rot: item.rot,
    };
  }

  function capture(e: RPointerEvent) {
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function onItemDown(e: RPointerEvent, item: T, mode: 'move' | 'handle') {
    if (!p.editable) return;
    e.stopPropagation();
    e.preventDefault();
    capture(e);
    p.onSelect(item.id);
    if (pointers.current.size >= 2) {
      startPinch();
      return;
    }
    if (mode === 'move') {
      gesture.current = { mode: 'move', id: item.id, sx: e.clientX, sy: e.clientY, x: item.x, y: item.y };
    } else {
      const r = ref.current!.getBoundingClientRect();
      const cx = r.left + item.x * r.width;
      const cy = r.top + item.y * r.height;
      gesture.current = {
        mode: 'handle',
        id: item.id,
        cx,
        cy,
        dist: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
        angle: Math.atan2(e.clientY - cy, e.clientX - cx),
        size: item.size,
        rot: item.rot,
      };
    }
  }

  function onBgDown(e: RPointerEvent) {
    if (!p.editable) return;
    if (pointers.current.size >= 1 && p.selectedId) {
      capture(e);
      startPinch();
      return;
    }
    p.onSelect(null);
  }

  function onMove(e: RPointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const r = ref.current!.getBoundingClientRect();
    if (g.mode === 'move') {
      p.onChange(g.id, {
        x: Math.min(1.3, Math.max(-0.3, g.x + (e.clientX - g.sx) / r.width)),
        y: Math.min(1.3, Math.max(-0.3, g.y + (e.clientY - g.sy) / r.height)),
      });
    } else if (g.mode === 'handle') {
      const dist = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
      const angle = Math.atan2(e.clientY - g.cy, e.clientX - g.cx);
      p.onChange(g.id, {
        size: clampSize((g.size * dist) / g.dist),
        rot: Math.round(g.rot + ((angle - g.angle) * 180) / Math.PI),
      });
    } else if (g.mode === 'pinch') {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      p.onChange(g.id, {
        size: clampSize((g.size * dist) / g.dist),
        rot: Math.round(g.rot + ((angle - g.angle) * 180) / Math.PI),
      });
    }
  }

  function onUp(e: RPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
    else if (gesture.current?.mode === 'pinch' && pointers.current.size < 2) gesture.current = null;
  }

  return (
    <div
      ref={ref}
      className={`tf-layer${p.allowOverflow ? ' allow-overflow' : ''}`}
      style={{ touchAction: p.editable && p.selectedId ? 'none' : 'auto' }}
      onPointerDown={onBgDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {p.items.map((item) => {
        const selected = p.editable && item.id === p.selectedId;
        return (
          <div
            key={item.id}
            className={`tf-item${p.editable ? ' editable' : ''}${selected ? ' selected' : ''}`}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${item.rot}deg)`,
              pointerEvents: p.editable ? 'auto' : 'none',
              ...p.itemStyle(item),
            }}
            onPointerDown={(e) => onItemDown(e, item, 'move')}
          >
            {p.renderItem(item)}
            {selected && (
              <span
                className="tf-handle"
                aria-label="Resize and rotate"
                onPointerDown={(e) => onItemDown(e, item, 'handle')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
