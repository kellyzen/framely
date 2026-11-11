'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { upload } from '@vercel/blob/client';
import {
  defaultConfig,
  defaultLayer,
  MAX_CUTOUTS,
  MAX_STICKERS,
  PATTERNS,
  SHOT_COUNTS,
  shotAspect,
  syncPlacements,
  THEMES,
  uid,
} from '@/lib/config';
import { cssFilter, FILTERS } from '@/lib/filters';
import { FONTS, LOGO_FONT } from '@/lib/fonts';
import { idbDel, idbGet, idbSet } from '@/lib/idb';
import { prepareUpload } from '@/lib/images';
import { rememberBooth } from '@/lib/myBooths';
import type { BoothConfig, FontId, Layer, Sticker } from '@/lib/types';
import Booth from './Booth';
import CutoutEditor from './CutoutEditor';
import FramePreview from './FramePreview';
import ShareDialog from './ShareDialog';
import ShotStage, { type StageAsset } from './ShotStage';
import { useFit, useImages } from './hooks';
import { useCamera } from './useCamera';
import { ColorPicker, Field, Segmented, Slider, Toggle } from './ui';

type Tab = 'layout' | 'photos' | 'frame' | 'decorate' | 'text' | 'booth';
interface LocalAsset {
  blob: Blob;
  orig?: Blob;
  url: string;
}
interface Draft {
  cfg: BoothConfig;
  blobs: Record<string, { blob: Blob; orig?: Blob }>;
}

const DRAFT_KEY = 'draft:new';

const EMOJIS: Record<string, string[]> = {
  Bride: ['👰', '👰‍♀️', '💍', '💐', '🤍', '🕊️', '💒', '👑', '💎', '🥂', '🍾', '💌', '🎀', '🌹', '🦢', '🪞'],
  Party: ['🎉', '🎊', '🥳', '🪩', '💃', '👯‍♀️', '🍸', '🍹', '🎈', '🎁', '🔥', '✨', '⭐', '🌟', '🎶', '🎤'],
  Love: ['💖', '💕', '💗', '💘', '😍', '😘', '💋', '🫶', '❤️', '🩷', '💜', '💞', '💝', '😻', '🥰', '💓'],
  Cute: ['🌸', '🌷', '🦋', '🍓', '🍒', '🌈', '☁️', '🦄', '🐰', '🧸', '🌼', '🫧', '🍑', '🌺', '🐚', '🎂'],
  Fun: ['😎', '🤪', '😂', '🙌', '👏', '💅', '🕶️', '📸', '🍰', '🍕', '🥤', '🛍️', '✌️', '🤳', '💯', '🙈'],
};

export default function Designer({
  initial,
  booth,
}: {
  initial?: BoothConfig;
  /** set when editing an existing booth */
  booth?: { id: string; key: string };
}) {
  const [cfg, setCfg] = useState<BoothConfig>(() => initial ?? defaultConfig());
  const [local, setLocal] = useState<Record<string, LocalAsset>>({});
  const [loaded, setLoaded] = useState(!!booth);
  const [tab, setTab] = useState<Tab>('layout');
  const [shot, setShot] = useState(0);
  const [selLayer, setSelLayer] = useState<string | null>(null);
  const [selSticker, setSelSticker] = useState<string | null>(null);
  const [slotCount, setSlotCount] = useState(() => initial?.cutouts.length ?? 0);
  const [editor, setEditor] = useState<{ assetId: string; fresh: boolean } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedInfo, setSavedInfo] = useState<{ id: string; key: string } | null>(booth ?? null);
  const [dirty, setDirty] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [trying, setTrying] = useState(false);
  const [textDraft, setTextDraft] = useState('');
  const [emojiCat, setEmojiCat] = useState('Bride');
  const [camPreview, setCamPreview] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const update = useCallback((fn: (d: BoothConfig) => void) => {
    setCfg((c) => {
      const d = structuredClone(c);
      fn(d);
      return d;
    });
    setDirty(true);
  }, []);

  // ---------- draft (new booths only) ----------
  useEffect(() => {
    if (booth) return;
    idbGet<Draft>(DRAFT_KEY).then((d) => {
      if (d?.cfg) {
        const l: Record<string, LocalAsset> = {};
        for (const [id, b] of Object.entries(d.blobs ?? {})) l[id] = { ...b, url: URL.createObjectURL(b.blob) };
        setCfg(d.cfg);
        setLocal(l);
        setSlotCount(d.cfg.cutouts.length);
      }
      setLoaded(true);
    });
  }, [booth]);

  useEffect(() => {
    if (!loaded || savedInfo) return;
    const t = setTimeout(() => {
      const blobs: Draft['blobs'] = {};
      for (const [id, a] of Object.entries(local)) blobs[id] = { blob: a.blob, orig: a.orig };
      idbSet(DRAFT_KEY, { cfg, blobs } satisfies Draft);
    }, 400);
    return () => clearTimeout(t);
  }, [cfg, local, loaded, savedInfo]);

  // warn before leaving with unsaved changes to a shared booth
  useEffect(() => {
    if (!dirty || !savedInfo) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, savedInfo]);

  // ---------- assets ----------
  const assetUrls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, a] of Object.entries(cfg.assets)) {
      const u = local[id]?.url ?? a.src;
      if (u) out[id] = u;
    }
    return out;
  }, [cfg.assets, local]);
  const images = useImages(assetUrls);
  const stageAssets = useMemo(() => {
    const out: Record<string, StageAsset> = {};
    for (const [id, a] of Object.entries(cfg.assets)) if (assetUrls[id]) out[id] = { url: assetUrls[id], w: a.w, h: a.h };
    return out;
  }, [cfg.assets, assetUrls]);

  async function addAsset(file: File): Promise<string | null> {
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return null;
    }
    try {
      const { blob, w, h } = await prepareUpload(file);
      const id = uid();
      setLocal((l) => ({ ...l, [id]: { blob, orig: blob, url: URL.createObjectURL(blob) } }));
      update((d) => {
        d.assets[id] = { src: '', w, h };
      });
      return id;
    } catch {
      setError('That image could not be opened. Try a JPG or PNG.');
      return null;
    }
  }

  function removeAssetIfUnused(d: BoothConfig, id: string) {
    const used = d.cutouts.includes(id) || d.stickers.some((s) => s.kind === 'image' && s.value === id);
    if (!used) delete d.assets[id];
  }

  async function onCutoutFile(file: File, replaceIndex?: number) {
    const id = await addAsset(file);
    if (!id) return;
    update((d) => {
      if (replaceIndex !== undefined && d.cutouts[replaceIndex]) {
        const old = d.cutouts[replaceIndex];
        d.cutouts[replaceIndex] = id;
        d.placements.forEach((list) => list.forEach((l) => l.assetId === old && (l.assetId = id)));
        removeAssetIfUnused(d, old);
      } else {
        d.cutouts.push(id);
      }
      syncPlacements(d);
    });
    setSlotCount((n) => Math.max(n, replaceIndex !== undefined ? n : cfg.cutouts.length + 1));
    setEditor({ assetId: id, fresh: true });
  }

  function removeCutout(index: number) {
    update((d) => {
      const [old] = d.cutouts.splice(index, 1);
      if (old) removeAssetIfUnused(d, old);
      syncPlacements(d);
    });
    setSlotCount((n) => Math.max(0, n - 1));
  }

  function changeSlotCount(n: number) {
    if (n < cfg.cutouts.length) {
      if (!confirm(`This removes ${cfg.cutouts.length - n} uploaded image(s). Continue?`)) return;
      update((d) => {
        const removed = d.cutouts.splice(n);
        removed.forEach((id) => removeAssetIfUnused(d, id));
        syncPlacements(d);
      });
    }
    setSlotCount(n);
  }

  function onEditorSave(blob: Blob, orig: Blob) {
    if (!editor) return;
    const id = editor.assetId;
    setLocal((l) => {
      if (l[id]) URL.revokeObjectURL(l[id].url);
      return { ...l, [id]: { blob, orig, url: URL.createObjectURL(blob) } };
    });
    setDirty(true);
    setEditor(null);
  }

  // ---------- placements ----------
  const shotLayers = cfg.placements[shot] ?? [];
  const selectedLayer = shotLayers.find((l) => l.id === selLayer) ?? null;

  function patchLayer(id: string, patch: Partial<Layer>) {
    update((d) => {
      d.autoPlace = false;
      const l = d.placements[shot]?.find((x) => x.id === id);
      if (l) Object.assign(l, patch);
    });
  }
  function addLayer(assetId: string) {
    const layer = defaultLayer(assetId);
    update((d) => {
      d.autoPlace = false;
      d.placements[shot].push(layer);
    });
    setSelLayer(layer.id);
  }
  function removeLayer(id: string) {
    update((d) => {
      d.autoPlace = false;
      d.placements[shot] = d.placements[shot].filter((l) => l.id !== id);
    });
    setSelLayer(null);
  }
  function moveLayer(id: string, dir: 1 | -1) {
    update((d) => {
      d.autoPlace = false;
      const list = d.placements[shot];
      const i = list.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    });
  }
  function applyPositionToAll() {
    update((d) => {
      d.autoPlace = false;
      const src = d.placements[shot];
      d.placements.forEach((list, si) => {
        if (si === shot) return;
        list.forEach((l, k) => {
          const s = src[k];
          if (s) Object.assign(l, { x: s.x, y: s.y, size: s.size, rot: s.rot, flip: s.flip });
        });
      });
    });
  }

  // ---------- stickers ----------
  const selectedSticker = cfg.stickers.find((s) => s.id === selSticker) ?? null;

  function addSticker(s: Omit<Sticker, 'id' | 'x' | 'y' | 'rot'> & Partial<Sticker>) {
    if (cfg.stickers.length >= MAX_STICKERS) {
      setError(`You can add up to ${MAX_STICKERS} stickers.`);
      return;
    }
    const st: Sticker = {
      id: uid(),
      x: 0.3 + Math.random() * 0.4,
      y: 0.15 + Math.random() * 0.7,
      rot: Math.round((Math.random() - 0.5) * 24),
      ...s,
    } as Sticker;
    update((d) => {
      d.stickers.push(st);
    });
    setSelSticker(st.id);
  }
  function patchSticker(id: string, patch: Partial<Sticker>) {
    update((d) => {
      const s = d.stickers.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });
  }
  function removeSticker(id: string) {
    update((d) => {
      const s = d.stickers.find((x) => x.id === id);
      d.stickers = d.stickers.filter((x) => x.id !== id);
      if (s?.kind === 'image') removeAssetIfUnused(d, s.value);
    });
    setSelSticker(null);
  }
  function stickerOrder(id: string, front: boolean) {
    update((d) => {
      const i = d.stickers.findIndex((x) => x.id === id);
      if (i < 0) return;
      const [s] = d.stickers.splice(i, 1);
      if (front) d.stickers.push(s);
      else d.stickers.unshift(s);
    });
  }

  // ---------- save & share ----------
  async function save() {
    setError(null);
    setSaving('Uploading images…');
    try {
      const used = new Set([...cfg.cutouts, ...cfg.stickers.filter((s) => s.kind === 'image').map((s) => s.value)]);
      const next = structuredClone(cfg);
      next.assets = {};
      for (const id of used) {
        const a = cfg.assets[id];
        if (!a) continue;
        let src = a.src;
        const l = local[id];
        if (l) {
          const res = await upload(`uploads/${id}.png`, l.blob, {
            access: 'public',
            handleUploadUrl: '/api/upload',
            contentType: 'image/png',
          });
          src = res.url;
        }
        if (src) next.assets[id] = { ...a, src };
      }
      setSaving('Saving your booth…');
      const res = await fetch(savedInfo ? `/api/booths/${savedInfo.id}` : '/api/booths', {
        method: savedInfo ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config: next, key: savedInfo?.key }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Saving failed. Please try again.');

      const info = savedInfo ?? { id: data.id as string, key: data.key as string };
      // uploaded: switch to the hosted images
      Object.values(local).forEach((l) => URL.revokeObjectURL(l.url));
      setLocal({});
      setCfg(next);
      setDirty(false);
      rememberBooth({ id: info.id, key: info.key, title: next.text.title || 'Untitled booth', updatedAt: new Date().toISOString() });
      if (!savedInfo) {
        setSavedInfo(info);
        window.history.replaceState(null, '', `/edit/${info.id}#k=${info.key}`);
        idbDel(DRAFT_KEY);
      }
      setShowShare(true);
    } catch (e) {
      const m = (e as Error).message || '';
      setError(
        /BLOB_READ_WRITE_TOKEN|not set up|503/i.test(m)
          ? 'Sharing is not set up yet. Connect a Vercel Blob store to the project (see README), then try again. You can still use “Try it” on this device.'
          : m || 'Saving failed. Check your connection and try again.',
      );
    } finally {
      setSaving(null);
    }
  }

  function startOver() {
    if (!confirm('Start a new booth from scratch? Your current draft will be cleared.')) return;
    Object.values(local).forEach((l) => URL.revokeObjectURL(l.url));
    setLocal({});
    setCfg(defaultConfig());
    setSlotCount(0);
    setShot(0);
    idbDel(DRAFT_KEY);
  }

  // ---------- preview ----------
  const aspect = shotAspect(cfg.shape);
  const showStage = tab === 'photos' && cfg.cutouts.length > 0;
  const stageFit = useFit(aspect);
  const cam = useCamera(showStage && camPreview, 'user');

  useEffect(() => {
    if (shot >= cfg.shots) setShot(0);
  }, [cfg.shots, shot]);

  // full-screen editing only makes sense on the placement / sticker steps
  useEffect(() => {
    if (!showStage && tab !== 'decorate') setExpanded(false);
  }, [showStage, tab]);

  useEffect(() => {
    if (!expanded) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [expanded]);

  /** the item the quick toolbar acts on (cutout on the photos step, sticker on the stickers step) */
  const editingItem = showStage ? selectedLayer : tab === 'decorate' ? selectedSticker : null;

  function nudge(by: { size?: number; rot?: number }) {
    if (!editingItem) return;
    const patch = {
      ...(by.size ? { size: Math.min(showStage ? 2.5 : 1.2, Math.max(0.02, editingItem.size * by.size)) } : {}),
      ...(by.rot ? { rot: editingItem.rot + by.rot } : {}),
    };
    if (showStage) patchLayer(editingItem.id, patch);
    else patchSticker(editingItem.id, patch);
  }

  function removeSelected() {
    if (!editingItem) return;
    if (showStage) removeLayer(editingItem.id);
    else removeSticker(editingItem.id);
  }

  if (!loaded) {
    return <div className="booth-msg" style={{ color: 'var(--muted)' }}>Loading…</div>;
  }

  const status = saving
    ? saving
    : savedInfo
      ? dirty
        ? 'Unsaved changes'
        : 'All changes saved'
      : 'Draft saved on this device';

  return (
    <>
      <header className="topbar">
        <Link href="/" className={`logo ${LOGO_FONT.className}`}>Framely</Link>
        <div className="row">
          {savedInfo && (
            <button className="btn btn-sm" onClick={() => setShowShare(true)}>🔗 Share</button>
          )}
          {!savedInfo && (
            <button className="btn btn-sm btn-ghost" onClick={startOver}>Start over</button>
          )}
        </div>
      </header>

      <div className="designer">
        <section className={`preview-pane${expanded ? ' expanded' : ''}`} aria-label="Preview">
          {expanded && (
            <div className="expanded-top">
              <strong>{showStage ? `Place star photos · Shot ${shot + 1}` : tab === 'decorate' ? 'Arrange stickers' : 'Preview'}</strong>
              <button className="btn btn-sm btn-dark" onClick={() => setExpanded(false)}>Done</button>
            </div>
          )}
          {showStage && (
            <div className="row" style={{ justifyContent: 'center' }}>
              <Segmented
                label="Shot"
                value={shot}
                onChange={(v) => {
                  setShot(v);
                  setSelLayer(null);
                }}
                options={Array.from({ length: cfg.shots }, (_, i) => ({ value: i, label: `Shot ${i + 1}` }))}
              />
            </div>
          )}
          <div className="preview-box">
            {showStage ? (
              <div ref={stageFit.ref} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {stageFit.w > 0 && (
                  <ShotStage
                    aspect={aspect}
                    style={{ width: stageFit.w, height: stageFit.h, borderRadius: 10, boxShadow: 'var(--shadow)' }}
                    layers={shotLayers}
                    assets={stageAssets}
                    editable
                    selectedId={selLayer}
                    onSelect={setSelLayer}
                    onChange={patchLayer}
                    onRemove={removeLayer}
                    background={
                      camPreview && !cam.error ? (
                        <video ref={cam.videoRef} className="mirror" playsInline muted autoPlay />
                      ) : (
                        <div className="placeholder" />
                      )
                    }
                  />
                )}
              </div>
            ) : (
              <FramePreview
                cfg={cfg}
                images={images}
                assetUrls={assetUrls}
                editable={tab === 'decorate'}
                selectedId={selSticker}
                onSelect={setSelSticker}
                onChange={patchSticker}
                onRemove={tab === 'decorate' ? removeSticker : undefined}
              />
            )}
          </div>
          {expanded && editingItem ? (
            <div className="quick-tools" role="toolbar" aria-label="Adjust selected item">
              <button className="btn btn-icon" onClick={() => nudge({ size: 1 / 1.12 })} aria-label="Smaller">－</button>
              <button className="btn btn-icon" onClick={() => nudge({ size: 1.12 })} aria-label="Bigger">＋</button>
              <button className="btn btn-icon" onClick={() => nudge({ rot: -15 })} aria-label="Rotate left">⟲</button>
              <button className="btn btn-icon" onClick={() => nudge({ rot: 15 })} aria-label="Rotate right">⟳</button>
              {showStage && selectedLayer && (
                <button className="btn btn-icon" onClick={() => patchLayer(selectedLayer.id, { flip: !selectedLayer.flip })} aria-label="Flip">↔</button>
              )}
              <button className="btn btn-icon btn-danger" onClick={removeSelected} aria-label="Delete">🗑</button>
            </div>
          ) : (
            <div className="preview-caption-row">
              <p className="preview-caption">
                {showStage
                  ? 'Tap a photo, then drag. Pinch or use the corner dot to resize.'
                  : tab === 'decorate'
                    ? 'Tap a sticker, then drag. Pinch or use the corner dot to resize.'
                    : 'Live preview of your frame'}
              </p>
              {!expanded && (showStage || tab === 'decorate') && (
                <button className="btn btn-sm expand-btn" onClick={() => setExpanded(true)}>⤢ Expand</button>
              )}
            </div>
          )}
        </section>

        <section className="controls-pane">
          <nav className="tabs" role="tablist" aria-label="Design steps">
            {(
              [
                ['layout', '1 · Layout'],
                ['photos', '2 · Star photos'],
                ['frame', '3 · Frame'],
                ['text', '4 · Text'],
                ['decorate', '5 · Stickers'],
                ['booth', '6 · Booth'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                className="tab"
                aria-selected={tab === id}
                onClick={(e) => {
                  setTab(id);
                  e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {error && (
            <div className="error-box" style={{ marginBottom: 16 }}>
              {error}{' '}
              <button className="btn btn-sm btn-ghost" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {tab === 'layout' && (
            <>
              <Field label="How many photos per strip?">
                <Segmented
                  label="Number of shots"
                  value={cfg.shots}
                  onChange={(n) =>
                    update((d) => {
                      d.shots = n;
                      syncPlacements(d);
                    })
                  }
                  options={SHOT_COUNTS.map((n) => ({ value: n as number, label: String(n) }))}
                />
              </Field>
              <Field label="Arrangement" hint={cfg.shots % 2 ? 'A grid needs an even number of photos.' : undefined}>
                <Segmented
                  label="Arrangement"
                  value={cfg.columns}
                  onChange={(c) => update((d) => void (d.columns = c))}
                  options={[
                    { value: 1, label: '▯ Strip' },
                    { value: 2, label: '▦ Grid', disabled: cfg.shots % 2 === 1 },
                  ]}
                />
              </Field>
              <Field label="Photo shape">
                <Segmented
                  label="Photo shape"
                  value={cfg.shape}
                  onChange={(v) => update((d) => void (d.shape = v))}
                  options={[
                    { value: 'landscape', label: 'Landscape' },
                    { value: 'square', label: 'Square' },
                    { value: 'portrait', label: 'Portrait' },
                  ]}
                />
              </Field>
            </>
          )}

          {tab === 'photos' && (
            <>
              <Field
                label="Star photos (optional)"
                hint="Upload photos of the bride, an idol, anyone. They appear in the shots next to your guests, like Photoism. Choose 0 if you just want a frame."
              >
                <Segmented
                  label="Number of star photos"
                  value={slotCount}
                  onChange={changeSlotCount}
                  options={Array.from({ length: MAX_CUTOUTS + 1 }, (_, n) => ({ value: n, label: n === 0 ? 'None' : String(n) }))}
                />
              </Field>

              {slotCount > 0 && (
                <div className="slots" style={{ marginBottom: 18 }}>
                  {Array.from({ length: slotCount }, (_, i) => {
                    const id = cfg.cutouts[i];
                    return (
                      <div key={i}>
                        <label className={`slot${id ? ' filled' : ''}`}>
                          <span className="slot-num">{i + 1}</span>
                          {id && assetUrls[id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={assetUrls[id]} alt={`Star photo ${i + 1}`} />
                          ) : (
                            <>
                              <span style={{ fontSize: 26 }}>＋</span>
                              Upload
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) onCutoutFile(f, id ? i : undefined);
                            }}
                          />
                        </label>
                        {id && (
                          <div className="slot-actions">
                            <button className="btn btn-sm" onClick={() => setEditor({ assetId: id, fresh: false })} aria-label="Cut out">
                              ✂️ Cut
                            </button>
                            <button className="btn btn-sm btn-icon btn-danger" onClick={() => removeCutout(i)} aria-label="Remove">
                              🗑
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {cfg.cutouts.length > 0 && (
                <>
                  <div className="card" style={{ marginBottom: 16 }}>
                    <p className="section-title">Position in Shot {shot + 1}</p>
                    <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                      Tap a photo in the preview to select it, then drag it into place.
                    </p>
                    <span className="label">In this shot</span>
                    <div className="layer-list" style={{ marginBottom: 12 }}>
                      {shotLayers.length === 0 && <span className="hint">No star photo in this shot.</span>}
                      {shotLayers.map((l, i) => (
                        <span key={l.id} className="chip-wrap">
                          <button className="layer-chip" aria-pressed={l.id === selLayer} onClick={() => setSelLayer(l.id)} aria-label={`Select photo ${i + 1}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={assetUrls[l.assetId]} alt="" />
                          </button>
                          <button className="chip-x" aria-label={`Remove photo ${i + 1} from this shot`} onClick={() => removeLayer(l.id)}>×</button>
                        </span>
                      ))}
                    </div>
                    <span className="label">Add to this shot</span>
                    <div className="layer-list" style={{ marginBottom: 12 }}>
                      {cfg.cutouts.map((id) => (
                        <button key={id} className="layer-chip" onClick={() => addLayer(id)} aria-label="Add this photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={assetUrls[id]} alt="" />
                        </button>
                      ))}
                    </div>

                    {selectedLayer && (
                      <>
                        <Field label="Size">
                          <Slider
                            label="Size"
                            value={Math.round(selectedLayer.size * 100)}
                            min={10}
                            max={200}
                            onChange={(v) => patchLayer(selectedLayer.id, { size: v / 100 })}
                            format={(v) => `${v}%`}
                          />
                        </Field>
                        <Field label="Rotation">
                          <Slider
                            label="Rotation"
                            value={selectedLayer.rot}
                            min={-180}
                            max={180}
                            onChange={(v) => patchLayer(selectedLayer.id, { rot: v })}
                            format={(v) => `${v}°`}
                          />
                        </Field>
                        <div className="row">
                          <button className="btn btn-sm" onClick={() => patchLayer(selectedLayer.id, { flip: !selectedLayer.flip })}>↔ Flip</button>
                          <button className="btn btn-sm" onClick={() => moveLayer(selectedLayer.id, 1)}>Bring forward</button>
                          <button className="btn btn-sm" onClick={() => moveLayer(selectedLayer.id, -1)}>Send back</button>
                          <button className="btn btn-sm btn-danger" onClick={() => removeLayer(selectedLayer.id)}>Remove from shot</button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="row" style={{ marginBottom: 12 }}>
                    {cfg.shots > 1 && (
                      <button className="btn btn-sm" onClick={applyPositionToAll}>Use this position for all shots</button>
                    )}
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        update((d) => {
                          d.autoPlace = true;
                          syncPlacements(d);
                        })
                      }
                    >
                      Reset to automatic
                    </button>
                  </div>
                  <Toggle
                    checked={camPreview}
                    onChange={setCamPreview}
                    label="Preview with my camera"
                    hint={cam.error ?? 'See how it lines up with real people while you place things.'}
                  />
                </>
              )}
            </>
          )}

          {tab === 'frame' && (
            <>
              <Field label="Quick themes">
                <div className="themes">
                  {THEMES.map((t) => {
                    const f = { ...cfg.frame, ...t.frame };
                    const bg =
                      f.style === 'gradient'
                        ? `linear-gradient(${f.angle}deg, ${f.color}, ${f.color2})`
                        : f.style === 'pattern'
                          ? `radial-gradient(${f.accent} 22%, transparent 24%) 0 0 / 12px 12px, ${f.color}`
                          : f.color;
                    return (
                      <button
                        key={t.name}
                        className="theme"
                        onClick={() =>
                          update((d) => {
                            Object.assign(d.frame, t.frame);
                            Object.assign(d.text, t.text);
                          })
                        }
                      >
                        <div className="chip" style={{ background: bg, color: t.text.color }}>Aa</div>
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="Style">
                <Segmented
                  label="Frame style"
                  value={cfg.frame.style}
                  onChange={(v) => update((d) => void (d.frame.style = v))}
                  options={[
                    { value: 'solid', label: 'Solid' },
                    { value: 'gradient', label: 'Gradient' },
                    { value: 'pattern', label: 'Pattern' },
                    { value: 'film', label: 'Film' },
                  ]}
                />
              </Field>
              <Field label={cfg.frame.style === 'gradient' ? 'Colour 1' : 'Background colour'}>
                <ColorPicker label="Background colour" value={cfg.frame.color} onChange={(v) => update((d) => void (d.frame.color = v))} />
              </Field>
              {cfg.frame.style === 'gradient' && (
                <>
                  <Field label="Colour 2">
                    <ColorPicker label="Second colour" value={cfg.frame.color2} onChange={(v) => update((d) => void (d.frame.color2 = v))} />
                  </Field>
                  <Field label="Direction">
                    <Slider label="Gradient angle" value={cfg.frame.angle} min={0} max={360} onChange={(v) => update((d) => void (d.frame.angle = v))} format={(v) => `${v}°`} />
                  </Field>
                </>
              )}
              {cfg.frame.style === 'pattern' && (
                <>
                  <Field label="Pattern">
                    <Segmented
                      label="Pattern"
                      value={cfg.frame.pattern}
                      onChange={(v) => update((d) => void (d.frame.pattern = v))}
                      options={PATTERNS.map((p) => ({ value: p.id, label: p.label }))}
                    />
                  </Field>
                  {cfg.frame.pattern !== 'confetti' && (
                    <Field label="Pattern colour">
                      <ColorPicker label="Pattern colour" value={cfg.frame.accent} onChange={(v) => update((d) => void (d.frame.accent = v))} />
                    </Field>
                  )}
                </>
              )}
              {cfg.frame.style === 'film' && (
                <Field label="Film hole colour">
                  <ColorPicker label="Film hole colour" value={cfg.frame.accent} onChange={(v) => update((d) => void (d.frame.accent = v))} />
                </Field>
              )}
              <Field label="Border thickness">
                <Segmented
                  label="Border thickness"
                  value={cfg.frame.thickness}
                  onChange={(v) => update((d) => void (d.frame.thickness = v))}
                  options={[
                    { value: 'thin', label: 'Thin' },
                    { value: 'medium', label: 'Medium' },
                    { value: 'thick', label: 'Thick' },
                  ]}
                />
              </Field>
              <Field label="Photo corners">
                <Segmented
                  label="Photo corners"
                  value={cfg.frame.radius}
                  onChange={(v) => update((d) => void (d.frame.radius = v))}
                  options={[
                    { value: 0, label: 'Square' },
                    { value: 12, label: 'Soft' },
                    { value: 32, label: 'Round' },
                  ]}
                />
              </Field>
            </>
          )}

          {tab === 'decorate' && (
            <>
              {cfg.stickers.length > 0 && (
                <Field label={`On your frame (${cfg.stickers.length})`} hint="Tap one to select it, or × to remove it.">
                  <div className="layer-list">
                    {cfg.stickers.map((s, i) => (
                      <span key={s.id} className="chip-wrap">
                        <button
                          className={`sticker-chip${s.kind === 'text' ? ' text' : ''}`}
                          aria-pressed={s.id === selSticker}
                          aria-label={`Select sticker ${i + 1}`}
                          onClick={() => setSelSticker(s.id)}
                        >
                          {s.kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={assetUrls[s.value]} alt="" />
                          ) : s.kind === 'text' ? (
                            s.value.slice(0, 14)
                          ) : (
                            s.value
                          )}
                        </button>
                        <button className="chip-x" aria-label={`Remove sticker ${i + 1}`} onClick={() => removeSticker(s.id)}>×</button>
                      </span>
                    ))}
                  </div>
                </Field>
              )}
              {selectedSticker && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <p className="section-title">Selected sticker</p>
                  {selectedSticker.kind === 'text' && (
                    <Field label="Text">
                      <input
                        className="input"
                        value={selectedSticker.value}
                        maxLength={60}
                        onChange={(e) => patchSticker(selectedSticker.id, { value: e.target.value })}
                      />
                    </Field>
                  )}
                  <Field label="Size">
                    <Slider
                      label="Sticker size"
                      value={Math.round(selectedSticker.size * 100)}
                      min={2}
                      max={100}
                      onChange={(v) => patchSticker(selectedSticker.id, { size: v / 100 })}
                      format={(v) => `${v}%`}
                    />
                  </Field>
                  <Field label="Rotation">
                    <Slider
                      label="Sticker rotation"
                      value={selectedSticker.rot}
                      min={-180}
                      max={180}
                      onChange={(v) => patchSticker(selectedSticker.id, { rot: v })}
                      format={(v) => `${v}°`}
                    />
                  </Field>
                  {selectedSticker.kind === 'text' && (
                    <>
                      <Field label="Colour">
                        <ColorPicker label="Text colour" value={selectedSticker.color ?? '#333333'} onChange={(v) => patchSticker(selectedSticker.id, { color: v })} />
                      </Field>
                      <Field label="Font">
                        <FontPicker value={selectedSticker.font ?? 'dmsans'} onChange={(v) => patchSticker(selectedSticker.id, { font: v })} />
                      </Field>
                    </>
                  )}
                  <div className="row">
                    <button className="btn btn-sm" onClick={() => addSticker({ ...selectedSticker, id: uid(), x: selectedSticker.x + 0.05, y: selectedSticker.y + 0.03 })}>Duplicate</button>
                    <button className="btn btn-sm" onClick={() => stickerOrder(selectedSticker.id, true)}>To front</button>
                    <button className="btn btn-sm" onClick={() => stickerOrder(selectedSticker.id, false)}>To back</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeSticker(selectedSticker.id)}>Delete</button>
                  </div>
                </div>
              )}

              <Field label="Emoji stickers" hint="Tap to add, then drag them anywhere on the frame.">
                <div className="emoji-cats">
                  <Segmented label="Emoji category" value={emojiCat} onChange={setEmojiCat} options={Object.keys(EMOJIS).map((k) => ({ value: k, label: k }))} />
                </div>
                <div className="emoji-grid">
                  {EMOJIS[emojiCat].map((e) => (
                    <button key={e} onClick={() => addSticker({ kind: 'emoji', value: e, size: 0.1 })} aria-label={`Add ${e}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Text sticker">
                <div className="row">
                  <input
                    className="input grow"
                    style={{ width: 'auto' }}
                    placeholder="e.g. Team Bride"
                    maxLength={60}
                    value={textDraft}
                    onChange={(e) => setTextDraft(e.target.value)}
                  />
                  <button
                    className="btn btn-dark"
                    disabled={!textDraft.trim()}
                    onClick={() => {
                      addSticker({ kind: 'text', value: textDraft.trim(), size: 0.07, color: cfg.text.color, font: 'pacifico' });
                      setTextDraft('');
                    }}
                  >
                    Add
                  </button>
                </div>
              </Field>
              <Field label="Image sticker" hint="Add a logo, a monogram, a PNG with a see-through background…">
                <label className="btn">
                  🖼️ Upload image
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const id = await addAsset(f);
                      if (id) addSticker({ kind: 'image', value: id, size: 0.25 });
                    }}
                  />
                </label>
              </Field>
              {cfg.stickers.length > 0 && (
                <button
                  className="btn btn-sm btn-ghost btn-danger"
                  onClick={() => {
                    if (!confirm('Remove all stickers?')) return;
                    update((d) => {
                      const imgs = d.stickers.filter((s) => s.kind === 'image').map((s) => s.value);
                      d.stickers = [];
                      imgs.forEach((id) => removeAssetIfUnused(d, id));
                    });
                    setSelSticker(null);
                  }}
                >
                  Remove all stickers
                </button>
              )}
            </>
          )}

          {tab === 'text' && (
            <>
              <Field label="Title (optional)">
                <input
                  className="input"
                  placeholder="e.g. Sarah's Last Fling 💍"
                  maxLength={80}
                  value={cfg.text.title}
                  onChange={(e) => update((d) => void (d.text.title = e.target.value))}
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  className="textarea"
                  placeholder="e.g. Bali · 12.12.2026"
                  maxLength={240}
                  value={cfg.text.description}
                  onChange={(e) => update((d) => void (d.text.description = e.target.value))}
                />
              </Field>
              <Field label="Title font">
                <FontPicker value={cfg.text.font} onChange={(v) => update((d) => void (d.text.font = v))} />
              </Field>
              <Field label="Text colour">
                <ColorPicker label="Text colour" value={cfg.text.color} onChange={(v) => update((d) => void (d.text.color = v))} />
              </Field>
              <Field label="Position">
                <Segmented
                  label="Text position"
                  value={cfg.text.position}
                  onChange={(v) => update((d) => void (d.text.position = v))}
                  options={[
                    { value: 'top', label: 'Top' },
                    { value: 'bottom', label: 'Bottom' },
                  ]}
                />
              </Field>
            </>
          )}

          {tab === 'booth' && (
            <>
              <Field label="Starting filter" hint="Guests see this filter first.">
                <div className="filter-chips" role="group" aria-label="Default filter">
                  {FILTERS.map((f) => (
                    <button key={f.id} className="filter-chip" aria-pressed={cfg.booth.filter === f.id} onClick={() => update((d) => void (d.booth.filter = f.id))}>
                      <span className="sw" style={{ filter: cssFilter(f) }} />
                      {f.name}
                    </button>
                  ))}
                </div>
              </Field>
              <Toggle
                checked={cfg.booth.guestFilters}
                onChange={(v) => update((d) => void (d.booth.guestFilters = v))}
                label="Let guests change filters"
              />
              <Field label="Countdown before each photo">
                <Segmented
                  label="Countdown"
                  value={cfg.booth.countdown}
                  onChange={(v) => update((d) => void (d.booth.countdown = v))}
                  options={[3, 5, 10].map((n) => ({ value: n, label: `${n}s` }))}
                />
              </Field>
              <Toggle
                checked={cfg.booth.mirror}
                onChange={(v) => update((d) => void (d.booth.mirror = v))}
                label="Save selfies mirrored"
                hint="Photos look exactly like the preview, like a mirror."
              />
            </>
          )}
        </section>
      </div>

      <div className="action-bar">
        <span className="status">{status}</span>
        <button className="btn" onClick={() => setTrying(true)}>▶ Try it</button>
        <button className="btn btn-primary" onClick={save} disabled={!!saving || (!!savedInfo && !dirty)}>
          {saving ? 'Saving…' : savedInfo ? 'Save changes' : 'Save & share'}
        </button>
      </div>

      {editor && assetUrls[editor.assetId] && (
        <CutoutEditor
          src={assetUrls[editor.assetId]}
          orig={local[editor.assetId]?.orig}
          fresh={editor.fresh}
          onCancel={() => setEditor(null)}
          onSave={onEditorSave}
        />
      )}
      {trying && <Booth cfg={cfg} assetUrls={assetUrls} onExit={() => setTrying(false)} exitLabel="Back to design" />}
      {showShare && savedInfo && <ShareDialog id={savedInfo.id} editKey={savedInfo.key} onClose={() => setShowShare(false)} />}
    </>
  );
}

function FontPicker({ value, onChange }: { value: FontId; onChange: (v: FontId) => void }) {
  return (
    <div className="font-grid">
      {(Object.keys(FONTS) as FontId[]).map((id) => (
        <button key={id} className={FONTS[id].className} aria-pressed={value === id} onClick={() => onChange(id)}>
          {FONTS[id].label}
        </button>
      ))}
    </div>
  );
}
