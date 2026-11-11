import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Encodes canvases into an animated GIF.
 * `order` lets frames repeat (e.g. boomerang = forward then back) without re-processing them.
 */
export async function encodeGif(
  frames: HTMLCanvasElement[],
  opts: { delay: number; order?: number[]; sharedPalette?: boolean },
): Promise<Blob> {
  const w = frames[0].width;
  const h = frames[0].height;
  const read = (c: HTMLCanvasElement) =>
    c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;

  let shared: Palette | undefined;
  if (opts.sharedPalette) shared = quantize(read(frames[Math.floor(frames.length / 2)]), 256);

  const encoded: { index: Uint8Array; palette: Palette }[] = [];
  for (const f of frames) {
    const data = read(f);
    const palette = shared ?? quantize(data, 256);
    encoded.push({ index: applyPalette(data, palette), palette });
    await tick();
  }

  const gif = GIFEncoder();
  const order = opts.order ?? frames.map((_, i) => i);
  for (const i of order) {
    gif.writeFrame(encoded[i].index, w, h, { palette: encoded[i].palette, delay: opts.delay });
  }
  gif.finish();
  return new Blob([gif.bytes() as BlobPart], { type: 'image/gif' });
}
