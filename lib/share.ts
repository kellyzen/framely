export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const f = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
    return navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}

/** Opens the phone's share sheet (Save Image, WhatsApp, Instagram...). Falls back to a download. */
export async function shareBlob(blob: Blob, filename: string, title = 'Framely') {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, filename);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
