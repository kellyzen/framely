'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { copyText } from '@/lib/share';
import { Modal } from './ui';

export default function ShareDialog({ id, editKey, onClose }: { id: string; editKey: string; onClose: () => void }) {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  const guestUrl = `${origin}/b/${id}`;
  const editUrl = `${origin}/edit/${id}#k=${editKey}`;

  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(guestUrl, { margin: 1, width: 600, color: { dark: '#2a1d27', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [origin, guestUrl]);

  async function copy(text: string, what: string) {
    if (await copyText(text)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    }
  }

  return (
    <Modal onClose={onClose} label="Share your booth">
      <h2>Your booth is ready 🎉</h2>
      <p className="hint" style={{ marginBottom: 16 }}>
        Send this link to guests or show the QR code at the party. It works on phones, tablets and laptops.
      </p>

      <span className="label">Guest link</span>
      <div className="link-box">
        <input className="input" readOnly value={guestUrl} onFocus={(e) => e.target.select()} />
        <button className="btn btn-primary" onClick={() => copy(guestUrl, 'guest')}>
          {copied === 'guest' ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {qr && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="qr" src={qr} alt="QR code for the guest link" />
          <div className="row" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <a className="btn btn-sm" href={qr} download="framely-qr.png">Download QR</a>
            <a className="btn btn-sm" href={guestUrl} target="_blank" rel="noreferrer">Open booth</a>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button className="btn btn-sm" onClick={() => navigator.share({ title: 'Framely booth', url: guestUrl }).catch(() => {})}>
                Share link
              </button>
            )}
          </div>
        </>
      )}

      <span className="label">Your private edit link</span>
      <div className="link-box" style={{ marginBottom: 8 }}>
        <input className="input" readOnly value={editUrl} onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={() => copy(editUrl, 'edit')}>{copied === 'edit' ? 'Copied!' : 'Copy'}</button>
      </div>
      <div className="warn">
        Keep the edit link to yourself. Anyone who has it can change this booth. It's also saved in this browser under “Your booths”.
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="btn btn-dark" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
