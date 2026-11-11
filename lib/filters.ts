/**
 * Photo filters. Each filter is a list of CSS-style operations, so the live
 * camera preview can use a CSS `filter` while the saved photo applies the exact
 * same colour maths to the pixels (works on every browser, including iOS Safari).
 */

type Op =
  | ['brightness', number]
  | ['contrast', number]
  | ['saturate', number]
  | ['sepia', number]
  | ['grayscale', number]
  | ['hue', number];

export interface FilterDef {
  id: string;
  name: string;
  ops: Op[];
  vignette?: number;
  grain?: number;
}

export const FILTERS: FilterDef[] = [
  { id: 'none', name: 'Original', ops: [] },
  { id: 'bright', name: 'Bright', ops: [['brightness', 1.12], ['contrast', 1.05], ['saturate', 1.15]] },
  { id: 'soft', name: 'Soft glow', ops: [['brightness', 1.1], ['contrast', 0.88], ['saturate', 0.92]] },
  { id: 'vintage', name: 'Vintage', ops: [['sepia', 0.45], ['contrast', 1.05], ['brightness', 1.05], ['saturate', 0.85]], vignette: 0.45, grain: 0.07 },
  { id: 'retro', name: 'Retro', ops: [['contrast', 1.15], ['saturate', 1.35], ['sepia', 0.2], ['hue', -8]], vignette: 0.3, grain: 0.09 },
  { id: 'bw', name: 'B&W', ops: [['grayscale', 1], ['contrast', 1.1], ['brightness', 1.05]] },
  { id: 'noir', name: 'Noir', ops: [['grayscale', 1], ['contrast', 1.45], ['brightness', 0.95]], vignette: 0.5, grain: 0.06 },
  { id: 'warm', name: 'Warm', ops: [['sepia', 0.22], ['saturate', 1.25], ['brightness', 1.04]] },
  { id: 'blush', name: 'Blush', ops: [['sepia', 0.18], ['hue', -14], ['saturate', 1.2], ['brightness', 1.07], ['contrast', 0.95]] },
  { id: 'faded', name: 'Faded', ops: [['contrast', 0.82], ['brightness', 1.1], ['saturate', 0.75], ['sepia', 0.1]] },
];

export function getFilter(id: string): FilterDef {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

export function cssFilter(f: FilterDef): string {
  if (!f.ops.length) return 'none';
  return f.ops
    .map(([op, v]) => (op === 'hue' ? `hue-rotate(${v}deg)` : `${op}(${v})`))
    .join(' ');
}

// 3x4 affine colour matrix, row-major: [r0 r1 r2 r3, g0.., b0..] where col 3 is an offset (0–1 range)
type M = number[];

const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function lin(m: number[]): M {
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0];
}

function opMatrix([op, v]: Op): M {
  switch (op) {
    case 'brightness':
      return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    case 'contrast': {
      const o = 0.5 - 0.5 * v;
      return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o];
    }
    case 'saturate':
      return lin([
        0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v,
        0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v,
      ]);
    case 'grayscale': {
      const g = 1 - Math.min(1, v);
      return lin([
        0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g,
        0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g,
        0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g,
      ]);
    }
    case 'sepia': {
      const s = 1 - Math.min(1, v);
      return lin([
        0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s,
        0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s,
        0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s,
      ]);
    }
    case 'hue': {
      const a = (v * Math.PI) / 180;
      const c = Math.cos(a);
      const s = Math.sin(a);
      return lin([
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
      ]);
    }
  }
}

/** Returns b ∘ a (apply a first, then b). */
function compose(b: M, a: M): M {
  const out: M = new Array(12).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = c === 3 ? b[r * 4 + 3] : 0;
      for (let k = 0; k < 3; k++) sum += b[r * 4 + k] * a[k * 4 + c];
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

function rand(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Applies a filter to a canvas in place. */
export function applyFilter(canvas: HTMLCanvasElement, f: FilterDef): void {
  if (!f.ops.length && !f.vignette && !f.grain) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const { width: w, height: h } = canvas;

  if (f.ops.length || f.grain) {
    let img: ImageData;
    try {
      img = ctx.getImageData(0, 0, w, h);
    } catch {
      return; // canvas is tainted (cross-origin image) – skip rather than crash
    }
    const m = f.ops.reduce<M>((acc, op) => compose(opMatrix(op), acc), I);
    const d = img.data;
    const o0 = m[3] * 255, o1 = m[7] * 255, o2 = m[11] * 255;
    const grain = (f.grain ?? 0) * 255;
    const rnd = rand(1234);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const n = grain ? (rnd() - 0.5) * grain : 0;
      d[i] = m[0] * r + m[1] * g + m[2] * b + o0 + n;
      d[i + 1] = m[4] * r + m[5] * g + m[6] * b + o1 + n;
      d[i + 2] = m[8] * r + m[9] * g + m[10] * b + o2 + n;
    }
    ctx.putImageData(img, 0, 0);
  }

  if (f.vignette) drawVignette(ctx, w, h, f.vignette);
}

export function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number) {
  const r = Math.hypot(w, h) / 2;
  const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** CSS background for the live-preview vignette overlay. */
export function vignetteCss(strength: number): string {
  return `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`;
}
