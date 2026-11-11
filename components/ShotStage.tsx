'use client';

import type { ReactNode } from 'react';
import { cssFilter, vignetteCss, type FilterDef } from '@/lib/filters';
import type { Layer } from '@/lib/types';
import Transformable from './Transformable';

export interface StageAsset {
  url: string;
  w: number;
  h: number;
}

interface Props {
  aspect: number;
  layers: Layer[];
  assets: Record<string, StageAsset | undefined>;
  background: ReactNode;
  filter?: FilterDef;
  editable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, patch: Partial<Layer>) => void;
  children?: ReactNode;
  /** CSS size constraints for the box */
  style?: React.CSSProperties;
}

/** A shot-shaped box: background (camera or placeholder) with cutouts on top. */
export default function ShotStage(p: Props) {
  const css = p.filter ? cssFilter(p.filter) : 'none';
  return (
    <div className="stage" style={{ aspectRatio: String(p.aspect), ...p.style }}>
      <div className="stage-inner" style={{ filter: css }}>
        {p.background}
        <Transformable
          items={p.layers}
          selectedId={p.selectedId ?? null}
          editable={!!p.editable}
          onSelect={p.onSelect ?? (() => {})}
          onChange={(id, patch) => p.onChange?.(id, patch)}
          minSize={0.08}
          maxSize={2.5}
          itemStyle={(l) => {
            const a = p.assets[l.assetId];
            return {
              height: `${l.size * 100}%`,
              aspectRatio: a ? `${a.w} / ${a.h}` : '3 / 4',
            };
          }}
          renderItem={(l) => {
            const a = p.assets[l.assetId];
            if (!a) return null;
            return (
              <img
                src={a.url}
                alt=""
                draggable={false}
                crossOrigin={a.url.startsWith('blob:') ? undefined : 'anonymous'}
                style={{ transform: l.flip ? 'scaleX(-1)' : undefined }}
              />
            );
          }}
        />
      </div>
      {p.filter?.vignette ? <div className="vignette" style={{ background: vignetteCss(p.filter.vignette) }} /> : null}
      {p.children}
    </div>
  );
}
