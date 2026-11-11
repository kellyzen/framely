'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Facing = 'user' | 'environment';

function explain(e: unknown): string {
  const name = (e as Error)?.name;
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'The camera only works on a secure (https) link.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Allow camera access for this site in your browser settings, then reload.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found on this device.';
  if (name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return 'Could not start the camera.';
}

/**
 * Starts the camera while `enabled`. Pass `videoRef` as the ref of a <video> element;
 * the stream is attached whenever that element appears. `video.current` is used for capturing.
 */
export function useCamera(enabled: boolean, facing: Facing) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const attach = useCallback((v: HTMLVideoElement | null) => {
    video.current = v;
    const s = stream.current;
    if (!v || !s || v.srcObject === s) return;
    v.muted = true;
    v.playsInline = true;
    v.srcObject = s;
    // Some cameras deliver tiny placeholder frames at first; wait for real ones.
    const onReady = () => {
      if (v.videoWidth > 16) setReady(true);
    };
    v.onloadedmetadata = onReady;
    v.onplaying = onReady;
    v.onresize = onReady;
    v.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'NotFoundError' });
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        attach(video.current);
      } catch (e) {
        if (!cancelled) setError(explain(e));
      }
    })();

    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      if (video.current) video.current.srcObject = null;
      setReady(false);
    };
  }, [enabled, facing, attach]);

  return { videoRef: attach, video, error, ready };
}
