export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('blob:') && !src.startsWith('data:')) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.decoding = 'async';
    img.src = src;
  });
}

/** Shrinks an uploaded photo so it stays light (keeps transparency, outputs PNG). */
export async function prepareUpload(file: Blob, max = 1200): Promise<{ blob: Blob; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('export failed'))), 'image/png'),
    );
    return { blob, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
