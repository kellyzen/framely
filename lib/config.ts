import type { BoothConfig, FontId, FrameSettings, Layer, Pattern, ShotShape, Sticker, TextSettings } from './types';

export const SHOT_COUNTS = [1, 2, 3, 4, 6] as const;
export const MAX_CUTOUTS = 6;
export const MAX_STICKERS = 60;

export function uid(len = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export function shotAspect(shape: ShotShape): number {
  return shape === 'portrait' ? 3 / 4 : shape === 'square' ? 1 : 4 / 3;
}

export function defaultConfig(): BoothConfig {
  return {
    v: 1,
    shots: 4,
    columns: 1,
    shape: 'landscape',
    frame: {
      style: 'solid',
      color: '#F7D6E0',
      color2: '#FFFFFF',
      accent: '#E2557E',
      pattern: 'dots',
      angle: 135,
      thickness: 'medium',
      radius: 12,
    },
    text: { title: '', description: '', font: 'greatvibes', color: '#8A3B5C', position: 'bottom' },
    assets: {},
    cutouts: [],
    autoPlace: true,
    placements: [[], [], [], []],
    stickers: [],
    booth: { filter: 'none', guestFilters: true, countdown: 3, mirror: true },
  };
}

export function defaultLayer(assetId: string): Layer {
  return { id: uid(), assetId, x: 0.72, y: 0.57, size: 0.86, rot: 0, flip: false };
}

export function autoPlacements(cfg: BoothConfig): Layer[][] {
  return Array.from({ length: cfg.shots }, (_, i) =>
    cfg.cutouts.length ? [defaultLayer(cfg.cutouts[i % cfg.cutouts.length])] : [],
  );
}

/** Keeps placements in sync with shots/cutouts. Call after any structural change. */
export function syncPlacements(cfg: BoothConfig): BoothConfig {
  if (cfg.shots % 2 === 1 && cfg.columns === 2) cfg.columns = 1;
  if (cfg.autoPlace) {
    cfg.placements = autoPlacements(cfg);
    return cfg;
  }
  const valid = new Set(cfg.cutouts);
  const next: Layer[][] = [];
  for (let i = 0; i < cfg.shots; i++) {
    next.push((cfg.placements[i] ?? []).filter((l) => valid.has(l.assetId)));
  }
  cfg.placements = next;
  return cfg;
}

export interface Theme {
  name: string;
  frame: Partial<FrameSettings>;
  text: Partial<TextSettings>;
}

export const THEMES: Theme[] = [
  { name: 'Blush', frame: { style: 'solid', color: '#F7D6E0' }, text: { color: '#8A3B5C' } },
  { name: 'Champagne', frame: { style: 'gradient', color: '#F7EBD3', color2: '#D4B483', angle: 135 }, text: { color: '#5C4320' } },
  { name: 'Veil', frame: { style: 'gradient', color: '#FFFFFF', color2: '#EBDDF2', angle: 180 }, text: { color: '#6B4C7A' } },
  { name: 'Polaroid', frame: { style: 'solid', color: '#FFFFFF', thickness: 'thick' }, text: { color: '#333333' } },
  { name: 'Midnight', frame: { style: 'solid', color: '#16151F' }, text: { color: '#F3E9D2' } },
  { name: 'Film', frame: { style: 'film', color: '#111111', accent: '#F2F2F2', radius: 0 }, text: { color: '#F2F2F2' } },
  { name: 'Gingham', frame: { style: 'pattern', pattern: 'gingham', color: '#FFFFFF', accent: '#F4A7B9' }, text: { color: '#B03A5B' } },
  { name: 'Hearts', frame: { style: 'pattern', pattern: 'hearts', color: '#FFE3EC', accent: '#FF8FAB' }, text: { color: '#C2185B' } },
  { name: 'Disco', frame: { style: 'pattern', pattern: 'stars', color: '#2A1B3D', accent: '#FFD86B' }, text: { color: '#FFD86B' } },
  { name: 'Confetti', frame: { style: 'pattern', pattern: 'confetti', color: '#FFFDF7' }, text: { color: '#333333' } },
  { name: 'Sunset', frame: { style: 'gradient', color: '#FF9A8B', color2: '#FF6A88', angle: 160 }, text: { color: '#FFFFFF' } },
  { name: 'Mint', frame: { style: 'pattern', pattern: 'dots', color: '#D8F3EA', accent: '#FFFFFF' }, text: { color: '#2F6B57' } },
];

export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: 'dots', label: 'Dots' },
  { id: 'stripes', label: 'Stripes' },
  { id: 'gingham', label: 'Gingham' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'stars', label: 'Sparkles' },
  { id: 'confetti', label: 'Confetti' },
];

// ---------- Sanitising (used by the API and when loading a booth) ----------

const HEX = /^#[0-9a-fA-F]{6}$/;
const FONTS: FontId[] = ['playfair', 'greatvibes', 'pacifico', 'bebas', 'caveat', 'dmsans'];
const ID = /^[A-Za-z0-9_-]{1,32}$/;

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}
function str(v: unknown, max: number, fallback = ''): string {
  return typeof v === 'string' ? v.slice(0, max) : fallback;
}
function color(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX.test(v) ? v : fallback;
}
function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}
function pickNum(v: unknown, options: readonly number[], fallback: number): number {
  return typeof v === 'number' && options.includes(v) ? v : fallback;
}

/**
 * Rebuilds a config from untrusted input, keeping only known fields.
 * `isAllowedSrc` decides which image URLs are accepted.
 */
export function sanitizeConfig(input: unknown, isAllowedSrc: (src: string) => boolean): BoothConfig {
  const d = defaultConfig();
  const c = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const f = c.frame ?? {};
  const t = c.text ?? {};
  const b = c.booth ?? {};

  const assets: BoothConfig['assets'] = {};
  if (c.assets && typeof c.assets === 'object') {
    for (const [id, a] of Object.entries(c.assets as Record<string, any>).slice(0, 80)) {
      if (!ID.test(id) || !a || typeof a.src !== 'string' || !isAllowedSrc(a.src)) continue;
      assets[id] = { src: a.src, w: num(a.w, 1, 10000, 100), h: num(a.h, 1, 10000, 100) };
    }
  }

  const shots = pickNum(c.shots, SHOT_COUNTS, 4);
  const cutouts = (Array.isArray(c.cutouts) ? c.cutouts : [])
    .filter((id: unknown) => typeof id === 'string' && assets[id])
    .slice(0, MAX_CUTOUTS) as string[];

  const placeable = (p: any) => ({
    id: typeof p?.id === 'string' && ID.test(p.id) ? p.id : uid(),
    x: num(p?.x, -0.5, 1.5, 0.5),
    y: num(p?.y, -0.5, 1.5, 0.5),
    size: num(p?.size, 0.02, 4, 0.5),
    rot: num(p?.rot, -720, 720, 0),
  });

  const placements: Layer[][] = Array.from({ length: shots }, (_, i) => {
    const list = Array.isArray(c.placements?.[i]) ? c.placements[i] : [];
    return list
      .filter((l: any) => typeof l?.assetId === 'string' && cutouts.includes(l.assetId))
      .slice(0, 8)
      .map((l: any) => ({ ...placeable(l), assetId: l.assetId, flip: !!l.flip }));
  });

  const stickers: Sticker[] = (Array.isArray(c.stickers) ? c.stickers : [])
    .slice(0, MAX_STICKERS)
    .filter((s: any) => ['emoji', 'text', 'image'].includes(s?.kind) && typeof s.value === 'string')
    .filter((s: any) => s.kind !== 'image' || assets[s.value])
    .map((s: any) => ({
      ...placeable(s),
      kind: s.kind,
      value: s.value.slice(0, 120),
      color: color(s.color, '#333333'),
      font: pick(s.font, FONTS, 'dmsans'),
    }));

  const cfg: BoothConfig = {
    v: 1,
    shots,
    columns: c.columns === 2 && shots % 2 === 0 ? 2 : 1,
    shape: pick(c.shape, ['portrait', 'square', 'landscape'] as const, d.shape),
    frame: {
      style: pick(f.style, ['solid', 'gradient', 'pattern', 'film'] as const, d.frame.style),
      color: color(f.color, d.frame.color),
      color2: color(f.color2, d.frame.color2),
      accent: color(f.accent, d.frame.accent),
      pattern: pick(f.pattern, ['dots', 'stripes', 'gingham', 'hearts', 'stars', 'confetti'] as const, 'dots'),
      angle: num(f.angle, 0, 360, 135),
      thickness: pick(f.thickness, ['thin', 'medium', 'thick'] as const, 'medium'),
      radius: num(f.radius, 0, 60, 12),
    },
    text: {
      title: str(t.title, 80),
      description: str(t.description, 240),
      font: pick(t.font, FONTS, d.text.font),
      color: color(t.color, d.text.color),
      position: t.position === 'top' ? 'top' : 'bottom',
    },
    assets,
    cutouts,
    autoPlace: !!c.autoPlace,
    placements,
    stickers,
    booth: {
      filter: str(b.filter, 24, 'none') || 'none',
      guestFilters: b.guestFilters !== false,
      countdown: pickNum(b.countdown, [3, 5, 10], 3),
      mirror: b.mirror !== false,
    },
  };
  return cfg;
}
