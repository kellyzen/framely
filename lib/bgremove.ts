/**
 * Automatic background removal, done entirely in the browser.
 * The AI model (about 80 MB) downloads the first time it is used, then the browser caches it.
 */
export async function removeBg(image: Blob, onProgress?: (pct: number) => void): Promise<Blob> {
  const { removeBackground } = await import('@imgly/background-removal');
  return removeBackground(image, {
    model: 'isnet_fp16',
    output: { format: 'image/png' },
    progress: (_key: string, current: number, total: number) => {
      if (onProgress && total) onProgress(Math.round((current / total) * 100));
    },
  });
}
