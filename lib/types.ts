export type FrameStyle = 'solid' | 'gradient' | 'pattern' | 'film';
export type Pattern = 'dots' | 'stripes' | 'gingham' | 'hearts' | 'stars' | 'confetti';
export type ShotShape = 'portrait' | 'square' | 'landscape';
export type Thickness = 'thin' | 'medium' | 'thick';
export type FontId = 'playfair' | 'greatvibes' | 'pacifico' | 'bebas' | 'caveat' | 'dmsans';

/** An uploaded image (cutout or image sticker). `src` is empty until it's uploaded. */
export interface Asset {
  src: string;
  w: number;
  h: number;
}

/** Shared shape for anything you can drag, resize and rotate. x/y are the centre, as fractions (0–1). */
export interface Placeable {
  id: string;
  x: number;
  y: number;
  size: number;
  rot: number;
}

/** A cutout placed inside one shot. `size` = height as a fraction of the shot height. */
export interface Layer extends Placeable {
  assetId: string;
  flip: boolean;
}

/** A decoration on the frame. `size` = fraction of the whole frame width. */
export interface Sticker extends Placeable {
  kind: 'emoji' | 'text' | 'image';
  /** emoji character, text, or asset id */
  value: string;
  color?: string;
  font?: FontId;
}

export interface FrameSettings {
  style: FrameStyle;
  color: string;
  color2: string;
  accent: string;
  pattern: Pattern;
  angle: number;
  thickness: Thickness;
  radius: number;
}

export interface TextSettings {
  title: string;
  description: string;
  font: FontId;
  color: string;
  position: 'top' | 'bottom';
}

export interface BoothSettings {
  filter: string;
  guestFilters: boolean;
  countdown: number;
  mirror: boolean;
}

export interface BoothConfig {
  v: 1;
  shots: number;
  columns: 1 | 2;
  shape: ShotShape;
  frame: FrameSettings;
  text: TextSettings;
  assets: Record<string, Asset>;
  /** asset ids of the "star" images, in order */
  cutouts: string[];
  /** when true, cutouts are placed automatically (one per shot, cycling) */
  autoPlace: boolean;
  /** one list of layers per shot */
  placements: Layer[][];
  stickers: Sticker[];
  booth: BoothSettings;
}

export interface StoredBooth {
  id: string;
  config: BoothConfig;
  editKeyHash: string;
  createdAt: string;
  updatedAt: string;
}
