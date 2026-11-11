'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { removeBg } from '@/lib/bgremove';
import { loadImage } from '@/lib/images';
import { canvasToBlob, createCanvas } from '@/lib/render';
import { Segmented, Slider } from './ui';

type Tool = 'lasso' | 'erase' | 'restore' | 'move';

interface Props {
  /** current image (may already have a transparent background) */
  src: string;
  /** the untouched original, so "restore" can bring parts back */
  orig?: Blob;
  fresh?: boolean;
  onCancel: () => void;
  onSave: (result: Blob, orig: Blob) => void;
}

const MAX_UNDO = 10;

export default function CutoutEditor({ src, orig, fresh, onCancel, onSave }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const origC = useRef<HTMLCanvasElement | null>(null);
  const maskC = useRef<HTMLCanvasElement | null>(null);
  const compC = useRef<HTMLCanvasElement | null>(null);
  const origBlob = useRef<Blob | null>(orig ?? null);
  const undo = useRef<ImageData[]>([]);

  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>('lasso');
  const [lassoMode, setLassoMode] = useState<'keep' | 'cut'>('keep');
  const [brush, setBrush] = useState(36);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const [showHint, setShowHint] = useState(!!fresh);

  const view = useRef({ s: 1, ox: 0, oy: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const stroke = useRef<{ last: { x: number; y: number } | null; lasso: { x: number; y: number }[]; active: boolean }>({
    last: null,
    lasso: [],
    active: false,
  });
  const pinch = useRef<{ dist: number; zoom: number; mid: { x: number; y: number }; pan: { x: number; y: number } } | null>(null);
  const panStart = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);

  // ---------- setup ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cur = await loadImage(src);
        const base = orig ? await loadImage(URL.createObjectURL(orig)) : cur;
        if (cancelled) return;
        const w = cur.naturalWidth;
        const h = cur.naturalHeight;
        const o = createCanvas(w, h);
        o.getContext('2d')!.drawImage(base, 0, 0, w, h);
        const m = createCanvas(w, h);
        const mctx = m.getContext('2d', { willReadFrequently: true })!;
        mctx.drawImage(cur, 0, 0, w, h);
        mctx.globalCompositeOperation = 'source-in';
        mctx.fillStyle = '#fff';
        mctx.fillRect(0, 0, w, h);
        mctx.globalCompositeOperation = 'source-over';
        origC.current = o;
        maskC.current = m;
        compC.current = createCanvas(w, h);
        if (!origBlob.current) origBlob.current = await canvasToBlob(o);
        setReady(true);
      } catch {
        setError('Could not open this image.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, orig]);

  // ---------- drawing ----------
  const redraw = useCallback(() => {
    const c = viewRef.current;
    const box = boxRef.current;
    const o = origC.current;
    const m = maskC.current;
    const comp = compC.current;
    if (!c || !box || !o || !m || !comp) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
      c.width = Math.round(cw * dpr);
      c.height = Math.round(ch * dpr);
    }
    const base = Math.min(cw / o.width, ch / o.height) * 0.92;
    const s = base * zoom;
    const ox = cw / 2 - (o.width * s) / 2 + pan.x;
    const oy = ch / 2 - (o.height * s) / 2 + pan.y;
    view.current = { s, ox, oy };

    const cctx = comp.getContext('2d')!;
    cctx.clearRect(0, 0, comp.width, comp.height);
    cctx.drawImage(m, 0, 0);
    cctx.globalCompositeOperation = 'source-in';
    cctx.drawImage(o, 0, 0);
    cctx.globalCompositeOperation = 'source-over';

    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.22; // faint "ghost" of removed parts, so you can restore them
    ctx.drawImage(o, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(comp, 0, 0);
    ctx.restore();

    const lasso = stroke.current.lasso;
    if (lasso.length > 1) {
      ctx.beginPath();
      lasso.forEach((p, i) => {
        const x = ox + p.x * s;
        const y = oy + p.y * s;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (cursor.current && (tool === 'erase' || tool === 'restore')) {
      ctx.beginPath();
      ctx.arc(cursor.current.x, cursor.current.y, brush / 2, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = tool === 'erase' ? '#ff5c8a' : '#5cffb0';
      ctx.stroke();
    }
  }, [zoom, pan, tool, brush]);

  useEffect(() => {
    if (!ready) return;
    redraw();
    const ro = new ResizeObserver(redraw);
    if (boxRef.current) ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [ready, redraw]);

  // ---------- undo ----------
  function snapshot() {
    const m = maskC.current!;
    undo.current.push(m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, m.width, m.height));
    if (undo.current.length > MAX_UNDO) undo.current.shift();
    setUndoCount(undo.current.length);
  }
  function doUndo() {
    const snap = undo.current.pop();
    if (!snap) return;
    maskC.current!.getContext('2d')!.putImageData(snap, 0, 0);
    setUndoCount(undo.current.length);
    redraw();
  }
  function resetMask() {
    snapshot();
    const m = maskC.current!;
    const ctx = m.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, m.width, m.height);
    redraw();
  }

  // ---------- pointer handling ----------
  function local(e: React.PointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function toImage(p: { x: number; y: number }) {
    const { s, ox, oy } = view.current;
    return { x: (p.x - ox) / s, y: (p.y - oy) / s };
  }

  function paint(from: { x: number; y: number }, to: { x: number; y: number }) {
    const m = maskC.current!;
    const ctx = m.getContext('2d')!;
    ctx.save();
    ctx.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush / view.current.s;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    ctx.restore();
  }

  function onDown(e: React.PointerEvent) {
    if (busy) return;
    boxRef.current!.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 2) {
      // second finger: switch to pinch-zoom, cancel the current stroke
      if (stroke.current.active && (tool === 'erase' || tool === 'restore')) doUndo();
      stroke.current = { last: null, lasso: [], active: false };
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        zoom,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        pan,
      };
      redraw();
      return;
    }
    if (pointers.current.size > 2) return;

    if (tool === 'move') {
      panStart.current = { x: p.x, y: p.y, pan };
      return;
    }
    const ip = toImage(p);
    if (tool === 'lasso') {
      stroke.current = { last: ip, lasso: [ip], active: true };
    } else {
      snapshot();
      stroke.current = { last: ip, lasso: [], active: true };
      paint(ip, ip);
    }
    redraw();
  }

  function onMove(e: React.PointerEvent) {
    const p = local(e);
    cursor.current = e.pointerType === 'mouse' ? p : null;
    if (!pointers.current.has(e.pointerId)) {
      if (e.pointerType === 'mouse') redraw();
      return;
    }
    pointers.current.set(e.pointerId, p);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setZoom(Math.min(8, Math.max(1, (pinch.current.zoom * dist) / pinch.current.dist)));
      setPan({ x: pinch.current.pan.x + mid.x - pinch.current.mid.x, y: pinch.current.pan.y + mid.y - pinch.current.mid.y });
      return;
    }
    if (panStart.current) {
      setPan({ x: panStart.current.pan.x + p.x - panStart.current.x, y: panStart.current.pan.y + p.y - panStart.current.y });
      return;
    }
    const st = stroke.current;
    if (!st.active) return;
    const ip = toImage(p);
    if (tool === 'lasso') st.lasso.push(ip);
    else if (st.last) paint(st.last, ip);
    st.last = ip;
    redraw();
  }

  function onUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pinch.current) {
      if (pointers.current.size === 0) pinch.current = null;
      return;
    }
    panStart.current = null;
    const st = stroke.current;
    if (st.active && tool === 'lasso' && st.lasso.length > 2) {
      snapshot();
      const m = maskC.current!;
      const ctx = m.getContext('2d')!;
      ctx.save();
      ctx.globalCompositeOperation = lassoMode === 'keep' ? 'destination-in' : 'destination-out';
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      st.lasso.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    stroke.current = { last: null, lasso: [], active: false };
    redraw();
  }

  function onWheel(e: React.WheelEvent) {
    setZoom((z) => Math.min(8, Math.max(1, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }

  // ---------- actions ----------
  async function autoRemove() {
    if (!origBlob.current) return;
    setShowHint(false);
    setError(null);
    setBusy('Getting the magic ready… (first time can take a minute)');
    try {
      const out = await removeBg(origBlob.current, (pct) => setBusy(`Downloading the cutout model… ${pct}%`));
      setBusy('Cutting out…');
      const url = URL.createObjectURL(out);
      const img = await loadImage(url);
      URL.revokeObjectURL(url);
      snapshot();
      const m = maskC.current!;
      const ctx = m.getContext('2d')!;
      ctx.save();
      ctx.clearRect(0, 0, m.width, m.height);
      ctx.drawImage(img, 0, 0, m.width, m.height);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, m.width, m.height);
      ctx.restore();
      setTool('restore');
    } catch (e) {
      console.error(e);
      setError('Automatic removal failed on this device. You can still cut it out yourself with the lasso or eraser.');
    } finally {
      setBusy(null);
      redraw();
    }
  }

  async function save() {
    const comp = compC.current;
    if (!comp || !origBlob.current) return;
    redraw();
    onSave(await canvasToBlob(comp), origBlob.current);
  }

  const toolHint: Record<Tool, string> = {
    lasso: lassoMode === 'keep' ? 'Draw around the person to keep them.' : 'Draw around an area to remove it.',
    erase: 'Paint over parts to remove them.',
    restore: 'Paint to bring removed parts back.',
    move: 'Drag to move around. Pinch or use the zoom slider.',
  };

  return (
    <div className="editor" role="dialog" aria-modal="true" aria-label="Cut out image">
      <div className="editor-top">
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <div className="row">
          <button className="btn btn-sm" onClick={doUndo} disabled={!undoCount}>↶ Undo</button>
          <button className="btn btn-sm" onClick={resetMask}>Reset</button>
        </div>
        <button className="btn btn-sm btn-primary" onClick={save} disabled={!ready || !!busy}>Done</button>
      </div>

      <div
        ref={boxRef}
        className="editor-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => {
          cursor.current = null;
          redraw();
        }}
        onWheel={onWheel}
        style={{ cursor: tool === 'move' ? 'grab' : 'crosshair' }}
      >
        <canvas ref={viewRef} />
        {(!ready || busy) && !error && (
          <div className="editor-busy">
            <div>
              <div className="spinner" />
              {busy ?? 'Loading…'}
            </div>
          </div>
        )}
        {showHint && ready && !busy && (
          <div className="editor-busy" onPointerDown={(e) => e.stopPropagation()}>
            <div style={{ maxWidth: 320 }}>
              <p style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Remove the background?</p>
              <p style={{ margin: '0 0 16px', opacity: 0.8 }}>Make it look like they're standing right next to you.</p>
              <div style={{ display: 'grid', gap: 8 }}>
                <button className="btn btn-primary" onClick={autoRemove}>✨ Remove automatically</button>
                <button className="btn" onClick={() => setShowHint(false)}>✂️ I'll cut it myself</button>
                <button className="btn" onClick={save}>Keep the photo as it is</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="editor-bottom">
        {error && <div className="error-box">{error}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Segmented<Tool>
            label="Tool"
            value={tool}
            onChange={setTool}
            options={[
              { value: 'lasso', label: '➰ Lasso' },
              { value: 'erase', label: '🧽 Erase' },
              { value: 'restore', label: '🖌️ Restore' },
              { value: 'move', label: '✋ Move' },
            ]}
          />
          <button className="btn btn-sm btn-primary" onClick={autoRemove} disabled={!ready || !!busy}>✨ Auto remove</button>
        </div>
        <p className="hint" style={{ color: 'rgba(255,255,255,0.7)', margin: 0 }}>{toolHint[tool]}</p>
        {tool === 'lasso' && (
          <Segmented
            label="Lasso mode"
            value={lassoMode}
            onChange={setLassoMode}
            options={[
              { value: 'keep', label: 'Keep inside' },
              { value: 'cut', label: 'Remove inside' },
            ]}
          />
        )}
        {(tool === 'erase' || tool === 'restore') && (
          <div className="row">
            <span style={{ fontSize: 13, minWidth: 70 }}>Brush</span>
            <div className="grow">
              <Slider label="Brush size" value={brush} min={6} max={120} onChange={setBrush} />
            </div>
          </div>
        )}
        <div className="row">
          <span style={{ fontSize: 13, minWidth: 70 }}>Zoom</span>
          <div className="grow">
            <Slider label="Zoom" value={zoom} min={1} max={8} step={0.1} onChange={setZoom} format={(v) => `${v.toFixed(1)}×`} />
          </div>
          <button className="btn btn-sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
        </div>
      </div>
    </div>
  );
}
