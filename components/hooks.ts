'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadImage } from '@/lib/images';
import type { ImageMap } from '@/lib/render';

/** Largest box with the given aspect ratio (w/h) that fits inside the container. */
export function useFit(aspect: number) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!el) {
      setBox({ w: 0, h: 0 });
      return;
    }
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      let w = cw;
      let h = w / aspect;
      if (h > ch) {
        h = ch;
        w = h * aspect;
      }
      setBox({ w: Math.floor(w), h: Math.floor(h) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, aspect]);

  return { ref: setEl, ...box };
}

/** Loads <img> elements for a map of id -> url (needed for drawing on canvas). */
export function useImages(urls: Record<string, string>): ImageMap {
  const [images, setImages] = useState<ImageMap>({});
  const key = useMemo(() => JSON.stringify(urls), [urls]);

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(urls).filter(([, u]) => !!u);
    Promise.all(
      entries.map(async ([id, url]) => {
        try {
          return [id, await loadImage(url)] as const;
        } catch {
          return [id, undefined] as const;
        }
      }),
    ).then((list) => {
      if (!cancelled) setImages(Object.fromEntries(list));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return images;
}
