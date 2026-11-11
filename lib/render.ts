import { shotAspect } from './config';
import { applyFilter, type FilterDef } from './filters';
import { canvasFont, EMOJI_FAMILY } from './fonts';
import type { BoothConfig, Layer, Sticker } from './types';

/** Width of one shot in the full-resolution output. */
export const SHOT_W = 720;

export type ImageMap = Record<string, HTMLImageElement | undefined>;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  W: number;
  H: number;
  shots: Rect[];
  title?: { x: number; y: number; size: number; maxW: number };
  desc?: { x: number; y: number; size: number; lines: string[] };
  filmSide: number;
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    if (line) lines.push(line);
  }
  return lines.slice(0, 4);
}

export function computeLayout(cfg: BoothConfig, scale = 1): FrameLayout {
  const s = scale;
  const shotW = SHOT_W * s;
  const shotH = shotW / shotAspect(cfg.shape);
  const pad = { thin: 26, medium: 50, thick: 84 }[cfg.frame.thickness] * s;
  const filmSide = cfg.frame.style === 'film' ? 52 * s : 0;
  const gap = Math.max(14 * s, pad * 0.5);
  const cols = Math.min(cfg.columns, cfg.shots);
  const rows = Math.ceil(cfg.shots / cols);
  const gridW = cols * shotW + (cols - 1) * gap;
  const gridH = rows * shotH + (rows - 1) * gap;
  const W = gridW + 2 * (pad + filmSide);

  const measure = createCanvas(1, 1).getContext('2d')!;
  const title = cfg.text.title.trim();
  const description = cfg.text.description.trim();
  let titleSize = (cols === 2 ? 84 : 70) * s;
  if (title) {
    measure.font = canvasFont(cfg.text.font, titleSize);
    const tw = measure.measureText(title).width;
    if (tw > gridW) titleSize *= gridW / tw;
  }
  const descSize = (cols === 2 ? 36 : 30) * s;
  measure.font = `500 ${descSize}px ${'system-ui, sans-serif'}`;
  const descLines = description ? wrap(measure, description, gridW) : [];

  const titleH = title ? titleSize * 1.35 : 0;
  const descH = descLines.length * descSize * 1.4;
  const hasText = !!(title || descLines.length);
  const innerGap = hasText ? Math.max(pad * 0.45, 18 * s) : 0;
  const textH = titleH + descH;
  const H = gridH + 2 * pad + (hasText ? innerGap + textH : 0);

  const gridX = pad + filmSide;
  const gridY = cfg.text.position === 'top' && hasText ? pad + textH + innerGap : pad;
  const textY = cfg.text.position === 'top' ? pad : pad + gridH + innerGap;

  const shots: Rect[] = [];
  for (let i = 0; i < cfg.shots; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    shots.push({ x: gridX + col * (shotW + gap), y: gridY + row * (shotH + gap), w: shotW, h: shotH });
  }

  return {
    W,
    H,
    shots,
    filmSide,
    title: title ? { x: W / 2, y: textY + titleH / 2, size: titleSize, maxW: gridW } : undefined,
    desc: descLines.length ? { x: W / 2, y: textY + titleH + descSize * 0.7, size: descSize, lines: descLines } : undefined,
  };
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

export function drawBackground(ctx: CanvasRenderingContext2D, cfg: BoothConfig, L: FrameLayout, s: number) {
  const { W, H } = L;
  const f = cfg.frame;
  ctx.save();
  if (f.style === 'gradient') {
    const a = ((f.angle - 90) * Math.PI) / 180;
    const len = (Math.abs(W * Math.cos(a)) + Math.abs(H * Math.sin(a))) / 2;
    const cx = W / 2, cy = H / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * len, cy - Math.sin(a) * len, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
    g.addColorStop(0, f.color);
    g.addColorStop(1, f.color2);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = f.color;
  }
  ctx.fillRect(0, 0, W, H);

  if (f.style === 'pattern') {
    ctx.fillStyle = f.accent;
    ctx.strokeStyle = f.accent;
    const rnd = seeded(7);
    switch (f.pattern) {
      case 'dots': {
        const sp = 34 * s;
        for (let y = 0, row = 0; y < H + sp; y += sp, row++) {
          for (let x = row % 2 ? sp / 2 : 0; x < W + sp; x += sp) {
            ctx.beginPath();
            ctx.arc(x, y, 5 * s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }
      case 'stripes': {
        const sp = 30 * s;
        ctx.lineWidth = 12 * s;
        for (let x = -H; x < W + H; x += sp) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + H, H);
          ctx.stroke();
        }
        break;
      }
      case 'gingham': {
        const sq = 26 * s;
        ctx.globalAlpha = 0.4;
        for (let x = 0; x < W; x += sq * 2) ctx.fillRect(x, 0, sq, H);
        for (let y = 0; y < H; y += sq * 2) ctx.fillRect(0, y, W, sq);
        break;
      }
      case 'hearts': {
        const sp = 56 * s;
        for (let y = sp / 2, row = 0; y < H + sp; y += sp, row++) {
          for (let x = row % 2 ? sp / 2 : 0; x < W + sp; x += sp) heart(ctx, x, y, 11 * s);
        }
        break;
      }
      case 'stars': {
        const count = Math.round((W * H) / (5200 * s * s));
        for (let i = 0; i < count; i++) sparkle(ctx, rnd() * W, rnd() * H, (5 + rnd() * 12) * s);
        break;
      }
      case 'confetti': {
        const colors = ['#FF8FAB', '#FFD166', '#06D6A0', '#4CC9F0', '#9B5DE5', '#F15BB5'];
        const count = Math.round((W * H) / (3000 * s * s));
        for (let i = 0; i < count; i++) {
          ctx.save();
          ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
          ctx.translate(rnd() * W, rnd() * H);
          ctx.rotate(rnd() * Math.PI);
          if (rnd() > 0.5) ctx.fillRect(-6 * s, -2.5 * s, 12 * s, 5 * s);
          else {
            ctx.beginPath();
            ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        break;
      }
    }
  }

  if (f.style === 'film' && L.filmSide) {
    ctx.fillStyle = f.accent;
    const hw = L.filmSide * 0.42, hh = L.filmSide * 0.3, sp = L.filmSide * 0.62;
    for (let y = sp / 2; y < H - hh; y += sp) {
      for (const x of [L.filmSide * 0.5 - hw / 2 + 6 * s, W - L.filmSide * 0.5 - hw / 2 - 6 * s]) {
        roundRect(ctx, x, y, hw, hh, 3 * s);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawText(ctx: CanvasRenderingContext2D, cfg: BoothConfig, L: FrameLayout) {
  ctx.save();
  ctx.fillStyle = cfg.text.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (L.title) {
    ctx.font = canvasFont(cfg.text.font, L.title.size);
    ctx.fillText(cfg.text.title.trim(), L.title.x, L.title.y, L.title.maxW);
  }
  if (L.desc) {
    ctx.font = `500 ${L.desc.size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    L.desc.lines.forEach((line, i) => ctx.fillText(line, L.desc!.x, L.desc!.y + i * L.desc!.size * 1.4));
  }
  ctx.restore();
}

export function drawSticker(ctx: CanvasRenderingContext2D, st: Sticker, W: number, H: number, images: ImageMap) {
  ctx.save();
  ctx.translate(st.x * W, st.y * H);
  ctx.rotate((st.rot * Math.PI) / 180);
  const px = st.size * W;
  if (st.kind === 'image') {
    const img = images[st.value];
    if (img) {
      const h = px * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, -px / 2, -h / 2, px, h);
    }
  } else {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = st.kind === 'emoji' ? `${px}px ${EMOJI_FAMILY}` : canvasFont(st.font ?? 'dmsans', px);
    ctx.fillStyle = st.color ?? '#333';
    ctx.fillText(st.value, 0, 0);
  }
  ctx.restore();
}

/**
 * Draws a full photo strip. `shots[i]` is a finished shot canvas (or undefined to leave blank).
 */
export function renderStrip(
  cfg: BoothConfig,
  shots: (HTMLCanvasElement | undefined)[],
  images: ImageMap,
  opts: { scale?: number; stickers?: boolean } = {},
): HTMLCanvasElement {
  const s = opts.scale ?? 1;
  const L = computeLayout(cfg, s);
  const canvas = createCanvas(L.W, L.H);
  const ctx = canvas.getContext('2d')!;
  drawBackground(ctx, cfg, L, s);
  L.shots.forEach((r, i) => {
    const shot = shots[i];
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, cfg.frame.radius * s);
    ctx.clip();
    if (shot) ctx.drawImage(shot, r.x, r.y, r.w, r.h);
    else {
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  });
  drawText(ctx, cfg, L);
  if (opts.stickers !== false) {
    for (const st of cfg.stickers) drawSticker(ctx, st, canvas.width, canvas.height, images);
  }
  return canvas;
}

/** A single shot in its frame (used for GIF / boomerang frames). */
export function renderSingleCard(cfg: BoothConfig, shot: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const single: BoothConfig = { ...cfg, shots: 1, columns: 1, stickers: [] };
  return renderStrip(single, [shot], {}, { scale: width / SHOT_W, stickers: false });
}

export interface ComposeOptions {
  w: number;
  h: number;
  source?: { el: CanvasImageSource; sw: number; sh: number };
  mirror?: boolean;
  layers: Layer[];
  images: ImageMap;
  filter?: FilterDef;
}

/** Builds one shot: camera frame (or a placeholder), cutouts on top, then the filter. */
export function composeShot(o: ComposeOptions): HTMLCanvasElement {
  const canvas = createCanvas(o.w, o.h);
  const ctx = canvas.getContext('2d', { willReadFrequently: !!o.filter })!;
  const w = canvas.width, h = canvas.height;

  if (o.source && o.source.sw > 16 && o.source.sh > 16) {
    const { el, sw, sh } = o.source;
    const scale = Math.max(w / sw, h / sh);
    const cw = w / scale, ch = h / scale;
    ctx.save();
    if (o.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(el, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h);
    ctx.restore();
  } else {
    drawPlaceholder(ctx, w, h);
  }

  for (const l of o.layers) {
    const img = o.images[l.assetId];
    if (!img || !img.naturalWidth) continue;
    const ph = l.size * h;
    const pw = ph * (img.naturalWidth / img.naturalHeight);
    ctx.save();
    ctx.translate(l.x * w, l.y * h);
    ctx.rotate((l.rot * Math.PI) / 180);
    if (l.flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph);
    ctx.restore();
  }

  if (o.filter) applyFilter(canvas, o.filter);
  return canvas;
}

export function drawPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#E9E4EC');
  g.addColorStop(1, '#CFC7D6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // a friendly "you" silhouette
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  const cx = w * 0.36, u = h / 10;
  ctx.beginPath();
  ctx.arc(cx, h - u * 6.2, u * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, h + u * 0.6, u * 3.2, u * 4.2, 0, Math.PI, 0);
  ctx.fill();
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export image'))), type, quality),
  );
}
