'use client';

import { useEffect, useMemo, useRef } from 'react';
import { EMOJI_FAMILY, ensureFonts, FONTS } from '@/lib/fonts';
import { composeShot, computeLayout, renderStrip, SHOT_W, type ImageMap } from '@/lib/render';
import { shotAspect } from '@/lib/config';
import type { BoothConfig, Sticker } from '@/lib/types';
import Transformable from './Transformable';
import { useFit } from './hooks';

interface Props {
  cfg: BoothConfig;
  images: ImageMap;
  assetUrls: Record<string, string>;
  editable: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Sticker>) => void;
  onRemove?: (id: string) => void;
}

/** Live preview of the whole frame. Stickers sit on top as draggable elements. */
export default function FramePreview({ cfg, images, assetUrls, editable, selectedId, onSelect, onChange, onRemove }: Props) {
  const full = useMemo(() => computeLayout(cfg, 1), [cfg]);
  const fit = useFit(full.W / full.H);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Everything except stickers affects the canvas; stickers are drawn as DOM elements while editing.
  const drawKey = JSON.stringify({ ...cfg, stickers: [] });

  useEffect(() => {
    if (!fit.w) return;
    let cancelled = false;
    let raf = 0;
    (async () => {
      await ensureFonts([cfg.text.font]);
      if (cancelled) return;
      raf = requestAnimationFrame(() => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = Math.min(1, (fit.w * dpr) / full.W);
        const shotW = SHOT_W * scale;
        const shotH = shotW / shotAspect(cfg.shape);
        const shots = cfg.placements.map((layers) => composeShot({ w: shotW, h: shotH, layers, images }));
        const out = renderStrip(cfg, shots, images, { scale, stickers: false });
        const c = canvasRef.current;
        if (!c) return;
        c.width = out.width;
        c.height = out.height;
        c.getContext('2d')!.drawImage(out, 0, 0);
      });
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawKey, images, fit.w]);

  return (
    <div ref={fit.ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {fit.w > 0 && (
        <div className="frame-wrap" style={{ width: fit.w, height: fit.h }}>
          <canvas ref={canvasRef} aria-label="Frame preview" />
          <Transformable
            items={cfg.stickers}
            selectedId={selectedId}
            editable={editable}
            allowOverflow
            onSelect={onSelect}
            onChange={onChange}
            onRemove={onRemove}
            minSize={0.02}
            maxSize={1.2}
            itemStyle={(s) =>
              s.kind === 'image'
                ? { width: `${s.size * 100}%`, aspectRatio: imgAspect(images, s.value) }
                : {}
            }
            renderItem={(s) => {
              if (s.kind === 'image') {
                const url = assetUrls[s.value];
                return url ? <img src={url} alt="" draggable={false} /> : null;
              }
              return (
                <span
                  className="sticker-text"
                  style={{
                    fontSize: `${s.size * 100}cqw`,
                    fontFamily: s.kind === 'emoji' ? EMOJI_FAMILY : FONTS[s.font ?? 'dmsans'].family,
                    fontWeight: s.kind === 'emoji' ? 400 : FONTS[s.font ?? 'dmsans'].weight,
                    color: s.color,
                  }}
                >
                  {s.value}
                </span>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

function imgAspect(images: ImageMap, id: string): string {
  const img = images[id];
  return img ? `${img.naturalWidth} / ${img.naturalHeight}` : '1 / 1';
}
