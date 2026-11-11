'use client';

import { useEffect, useMemo, useState } from 'react';
import { shotAspect } from '@/lib/config';
import { ensureFonts, LOGO_FONT } from '@/lib/fonts';
import { composeShot, renderStrip, SHOT_W } from '@/lib/render';
import type { BoothConfig } from '@/lib/types';
import Booth from './Booth';
import { useImages } from './hooks';

/** What guests see when they open the shared link: a preview, then the booth. */
export default function GuestBooth({ config }: { config: BoothConfig }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const urls = useMemo(() => Object.fromEntries(Object.entries(config.assets).map(([id, a]) => [id, a.src])), [config]);
  const images = useImages(urls);

  useEffect(() => {
    let cancelled = false;
    ensureFonts([config.text.font, ...config.stickers.map((s) => s.font ?? 'dmsans')]).then(() => {
      if (cancelled) return;
      const scale = 0.5;
      const w = SHOT_W * scale;
      const h = w / shotAspect(config.shape);
      const shots = config.placements.map((layers) => composeShot({ w, h, layers, images }));
      setPreview(renderStrip(config, shots, images, { scale }).toDataURL('image/jpeg', 0.85));
    });
    return () => {
      cancelled = true;
    };
  }, [config, images]);

  const title = config.text.title.trim();

  return (
    <>
      <main className="guest">
        <span className={`logo ${LOGO_FONT.className}`}>Framely</span>
        {title && <h1 style={{ margin: 0, fontSize: 28 }}>{title}</h1>}
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview" src={preview} alt="The photo frame" />
        ) : (
          <div className="spinner" />
        )}
        <button className="btn btn-primary btn-lg" onClick={() => setOpen(true)}>📸 Start the photo booth</button>
        <p className="hint" style={{ maxWidth: 340 }}>
          Your browser will ask to use the camera. Photos are made on your device and never uploaded.
        </p>
      </main>
      {open && <Booth cfg={config} assetUrls={urls} onExit={() => setOpen(false)} exitLabel="Back" />}
    </>
  );
}
