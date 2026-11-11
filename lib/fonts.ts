import { Bebas_Neue, Caveat, DM_Sans, Great_Vibes, Pacifico, Playfair_Display } from 'next/font/google';
import type { FontId } from './types';

const playfair = Playfair_Display({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' });
const greatvibes = Great_Vibes({ subsets: ['latin'], weight: '400', display: 'swap' });
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', display: 'swap' });
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap' });
const caveat = Caveat({ subsets: ['latin'], weight: ['500', '700'], display: 'swap' });
export const dmsans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' });

export const FONTS: Record<FontId, { label: string; family: string; weight: number; className: string }> = {
  greatvibes: { label: 'Script', family: greatvibes.style.fontFamily, weight: 400, className: greatvibes.className },
  playfair: { label: 'Elegant', family: playfair.style.fontFamily, weight: 700, className: playfair.className },
  pacifico: { label: 'Fun', family: pacifico.style.fontFamily, weight: 400, className: pacifico.className },
  caveat: { label: 'Handwritten', family: caveat.style.fontFamily, weight: 700, className: caveat.className },
  bebas: { label: 'Bold', family: bebas.style.fontFamily, weight: 400, className: bebas.className },
  dmsans: { label: 'Clean', family: dmsans.style.fontFamily, weight: 700, className: dmsans.className },
};

export const LOGO_FONT = pacifico;

export const EMOJI_FAMILY = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function canvasFont(id: FontId, px: number): string {
  const f = FONTS[id];
  return `${f.weight} ${px}px ${f.family}`;
}

/** Make sure the fonts used by a config are loaded before drawing on a canvas. */
export async function ensureFonts(ids: FontId[]): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(
    [...new Set(ids)].map((id) => document.fonts.load(canvasFont(id, 48)).catch(() => undefined)),
  );
}
