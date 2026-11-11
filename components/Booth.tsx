'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { shotAspect } from '@/lib/config';
import { cssFilter, FILTERS, getFilter } from '@/lib/filters';
import { ensureFonts } from '@/lib/fonts';
import { encodeGif } from '@/lib/gif';
import { canvasToBlob, composeShot, createCanvas, renderSingleCard, renderStrip, SHOT_W } from '@/lib/render';
import { canShareFiles, downloadBlob, shareBlob } from '@/lib/share';
import type { BoothConfig } from '@/lib/types';
import ShotStage, { type StageAsset } from './ShotStage';
import { useFit, useImages } from './hooks';
import { useCamera, type Facing } from './useCamera';
import { Segmented } from './ui';

type Mode = 'strip' | 'boomerang';
type Phase = 'live' | 'shooting' | 'processing' | 'result';
type Gif = { blob: Blob; url: string } | 'loading' | 'error' | null;

interface Result {
  kind: Mode;
  blob: Blob;
  url: string;
  gif: Gif;
}

const BOOMERANG_FRAMES = 14;
const GIF_WIDTH = 480;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Booth({
  cfg,
  assetUrls,
  onExit,
  exitLabel = 'Exit',
}: {
  cfg: BoothConfig;
  assetUrls: Record<string, string>;
  onExit?: () => void;
  exitLabel?: string;
}) {
  const aspect = shotAspect(cfg.shape);
  const cutoutUrls = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of cfg.cutouts) if (assetUrls[id]) out[id] = assetUrls[id];
    for (const s of cfg.stickers) if (s.kind === 'image' && assetUrls[s.value]) out[s.value] = assetUrls[s.value];
    return out;
  }, [cfg, assetUrls]);
  const images = useImages(cutoutUrls);
  const stageAssets = useMemo(() => {
    const out: Record<string, StageAsset> = {};
    for (const id of cfg.cutouts) {
      const a = cfg.assets[id];
      if (a && assetUrls[id]) out[id] = { url: assetUrls[id], w: a.w, h: a.h };
    }
    return out;
  }, [cfg, assetUrls]);

  const [facing, setFacing] = useState<Facing>('user');
  const cam = useCamera(true, facing);
  const [filterId, setFilterId] = useState(cfg.booth.filter);
  const [mode, setMode] = useState<Mode>('strip');
  const [phase, setPhase] = useState<Phase>('live');
  const [shotIdx, setShotIdx] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [view, setView] = useState<'photo' | 'gif'>('photo');
  const [sound, setSound] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const fit = useFit(aspect);

  const alive = useRef(true);
  const audio = useRef<AudioContext | null>(null);
  const filter = getFilter(filterId);
  const mirrorSave = facing === 'user' && cfg.booth.mirror;

  useEffect(() => {
    setCanShare(canShareFiles());
    alive.current = true;
    return () => {
      alive.current = false;
      audio.current?.close().catch(() => undefined);
    };
  }, []);

  // object URLs we created; freed on retake and when leaving the booth
  const urls = useRef<string[]>([]);
  const track = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    urls.current.push(u);
    return u;
  };
  const freeUrls = () => {
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
  };
  useEffect(() => freeUrls, []);

  function beep(freq: number, ms: number) {
    if (!sound) return;
    try {
      const ctx = (audio.current ??= new AudioContext());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + ms / 1000);
    } catch {
      // audio not available
    }
  }

  async function countdown(seconds: number) {
    for (let n = seconds; n > 0; n--) {
      if (!alive.current) throw new Error('cancelled');
      setCount(n);
      beep(n === 1 ? 880 : 660, 120);
      await sleep(1000);
    }
    setCount(null);
  }

  async function waitForFrames() {
    for (let i = 0; i < 20; i++) {
      const v = cam.video.current;
      if (v && v.videoWidth > 16 && v.readyState >= 2) return;
      await sleep(100);
    }
  }

  function grabFrame(width: number): HTMLCanvasElement {
    const v = cam.video.current!;
    return composeShot({
      w: width,
      h: width / aspect,
      source: { el: v, sw: v.videoWidth, sh: v.videoHeight },
      mirror: mirrorSave,
      layers: [],
      images: {},
    });
  }

  async function runStrip() {
    setPhase('shooting');
    freeUrls();
    setThumbs([]);
    const shots: HTMLCanvasElement[] = [];
    try {
      for (let i = 0; i < cfg.shots; i++) {
        setShotIdx(i);
        await countdown(cfg.booth.countdown);
        await waitForFrames();
        const raw = grabFrame(SHOT_W);
        setFlashKey((k) => k + 1);
        beep(1200, 80);
        const shot = composeShot({
          w: raw.width,
          h: raw.height,
          source: { el: raw, sw: raw.width, sh: raw.height },
          layers: cfg.placements[i] ?? [],
          images,
          filter,
        });
        shots.push(shot);
        const thumb = await canvasToBlob(shot, 'image/jpeg', 0.6);
        setThumbs((t) => [...t, track(thumb)]);
        await sleep(i < cfg.shots - 1 ? 900 : 300);
      }
      setPhase('processing');
      await ensureFonts([cfg.text.font, ...cfg.stickers.map((s) => s.font ?? 'dmsans')]);
      const strip = renderStrip(cfg, shots, images);
      const blob = await canvasToBlob(strip, 'image/jpeg', 0.93);
      if (!alive.current) return;
      setResult({ kind: 'strip', blob, url: track(blob), gif: 'loading' });
      setView('photo');
      setPhase('result');

      // build the GIF in the background
      const cards = shots.map((s) => {
        const small = createCanvas(GIF_WIDTH, GIF_WIDTH / aspect);
        small.getContext('2d')!.drawImage(s, 0, 0, small.width, small.height);
        return renderSingleCard(cfg, small, GIF_WIDTH);
      });
      try {
        const gif = await encodeGif(cards, { delay: 550 });
        if (alive.current) setResult((r) => (r ? { ...r, gif: { blob: gif, url: track(gif) } } : r));
      } catch {
        if (alive.current) setResult((r) => (r ? { ...r, gif: 'error' } : r));
      }
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setMsg('Something went wrong. Please try again.');
      setCount(null);
      setPhase('live');
    }
  }

  async function runBoomerang() {
    setPhase('shooting');
    setShotIdx(0);
    try {
      await countdown(cfg.booth.countdown);
      await waitForFrames();
      beep(1200, 80);
      const frames: HTMLCanvasElement[] = [];
      for (let k = 0; k < BOOMERANG_FRAMES; k++) {
        frames.push(grabFrame(GIF_WIDTH));
        await sleep(75);
      }
      setFlashKey((k) => k + 1);
      setPhase('processing');
      await ensureFonts([cfg.text.font]);
      const cards = frames.map((raw) =>
        renderSingleCard(
          cfg,
          composeShot({
            w: raw.width,
            h: raw.height,
            source: { el: raw, sw: raw.width, sh: raw.height },
            layers: cfg.placements[0] ?? [],
            images,
            filter,
          }),
          GIF_WIDTH,
        ),
      );
      const order = [...cards.keys(), ...[...cards.keys()].reverse().slice(1, -1)];
      const gif = await encodeGif(cards, { delay: 70, order, sharedPalette: true });
      if (!alive.current) return;
      setResult({ kind: 'boomerang', blob: gif, url: track(gif), gif: null });
      setPhase('result');
    } catch (e) {
      if ((e as Error).message !== 'cancelled') setMsg('Something went wrong. Please try again.');
      setCount(null);
      setPhase('live');
    }
  }

  function start() {
    setMsg(null);
    // create audio on a user tap (required by mobile browsers)
    if (sound && !audio.current) {
      try {
        audio.current = new AudioContext();
      } catch {
        // ignore
      }
    }
    if (mode === 'strip') runStrip();
    else runBoomerang();
  }

  function again() {
    freeUrls();
    setResult(null);
    setThumbs([]);
    setShotIdx(0);
    setPhase('live');
  }

  const current = result
    ? result.kind === 'strip' && view === 'gif' && result.gif && typeof result.gif === 'object'
      ? { blob: result.gif.blob, url: result.gif.url, name: 'framely.gif' }
      : { blob: result.blob, url: result.url, name: result.kind === 'strip' ? 'framely-strip.jpg' : 'framely-boomerang.gif' }
    : null;

  const title = cfg.text.title.trim() || 'Framely booth';
  const layers = cfg.placements[mode === 'boomerang' ? 0 : shotIdx] ?? [];

  return (
    <div className="booth">
      <div className="booth-top">
        {onExit ? (
          <button className="btn btn-sm" onClick={onExit}>← {exitLabel}</button>
        ) : (
          <span style={{ width: 60 }} />
        )}
        <span className="booth-title">{title}</span>
        <button className="btn btn-sm" onClick={() => setSound((s) => !s)} aria-label={sound ? 'Mute' : 'Unmute'}>
          {sound ? '🔊' : '🔇'}
        </button>
      </div>

      {phase === 'result' && result && current ? (
        <>
          <div className="result">
            {result.kind === 'strip' && (
              <Segmented
                label="Result type"
                value={view}
                onChange={setView}
                options={[
                  { value: 'photo', label: '📸 Photo strip' },
                  { value: 'gif', label: result.gif === 'loading' ? '⏳ GIF' : '🎞️ GIF', disabled: !result.gif || typeof result.gif !== 'object' },
                ]}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="result-img" src={current.url} alt="Your photo" />
          </div>
          <div className="booth-bottom">
            <div className="row" style={{ justifyContent: 'center' }}>
              {canShare && (
                <button className="btn btn-primary btn-lg" onClick={() => shareBlob(current.blob, current.name, title)}>
                  Share / Save
                </button>
              )}
              <button className={`btn btn-lg ${canShare ? '' : 'btn-primary'}`} onClick={() => downloadBlob(current.blob, current.name)}>
                Download
              </button>
              <button className="btn btn-lg" onClick={again}>Retake</button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="booth-main">
            <div className="booth-stage-box" ref={fit.ref}>
              {cam.error ? (
                <div className="booth-msg">
                  <p style={{ fontSize: 40, margin: 0 }}>📷</p>
                  <p>{cam.error}</p>
                </div>
              ) : (
                fit.w > 0 && (
                  <ShotStage
                    aspect={aspect}
                    style={{ width: fit.w, height: fit.h }}
                    layers={layers}
                    assets={stageAssets}
                    filter={filter}
                    background={
                      <video ref={cam.videoRef} className={facing === 'user' ? 'mirror' : ''} playsInline muted autoPlay />
                    }
                  >
                    {mode === 'strip' && phase !== 'live' && (
                      <span className="shot-badge">
                        {Math.min(shotIdx + 1, cfg.shots)} / {cfg.shots}
                      </span>
                    )}
                    {count !== null && (
                      <div className="countdown" key={count}>
                        {count}
                      </div>
                    )}
                    {flashKey > 0 && <div className="flash" key={flashKey} />}
                    {phase === 'processing' && (
                      <div className="editor-busy">
                        <div>
                          <div className="spinner" />
                          Making your {mode === 'strip' ? 'photo strip' : 'boomerang'}…
                        </div>
                      </div>
                    )}
                  </ShotStage>
                )
              )}
            </div>
          </div>

          <div className="booth-bottom">
            {msg && <div className="error-box">{msg}</div>}
            {mode === 'strip' && (
              <div className="thumbs" aria-label="Shots">
                {Array.from({ length: cfg.shots }, (_, i) =>
                  thumbs[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={thumbs[i]} alt={`Shot ${i + 1}`} />
                  ) : (
                    <button
                      key={i}
                      aria-label={`Preview pose ${i + 1}`}
                      aria-current={i === shotIdx}
                      disabled={phase !== 'live'}
                      onClick={() => setShotIdx(i)}
                    />
                  ),
                )}
              </div>
            )}
            {cfg.booth.guestFilters && phase === 'live' && (
              <div className="filter-chips" role="group" aria-label="Filters">
                {FILTERS.map((f) => (
                  <button key={f.id} className="filter-chip" aria-pressed={f.id === filterId} onClick={() => setFilterId(f.id)}>
                    <span className="sw" style={{ filter: cssFilter(f) }} />
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            {phase === 'live' && (
              <div className="row" style={{ justifyContent: 'center' }}>
                <Segmented
                  label="Mode"
                  value={mode}
                  onChange={(m) => phase === 'live' && setMode(m)}
                  options={[
                    { value: 'strip', label: `📸 ${cfg.shots > 1 ? `Photo strip (${cfg.shots})` : 'Photo'}` },
                    { value: 'boomerang', label: '🔁 Boomerang' },
                  ]}
                />
              </div>
            )}
            <div className="booth-controls">
              <span style={{ width: 44 }} />
              <button
                className="shutter"
                aria-label="Start"
                onClick={start}
                disabled={phase !== 'live' || !cam.ready}
              />
              <button
                className="btn btn-icon"
                aria-label="Switch camera"
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                disabled={phase !== 'live'}
              >
                🔄
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
