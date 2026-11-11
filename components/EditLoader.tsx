'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sanitizeConfig } from '@/lib/config';
import type { BoothConfig } from '@/lib/types';
import Designer from './Designer';

/** The edit key lives in the URL #fragment, so it never reaches the server logs. */
export default function EditLoader({ id }: { id: string }) {
  const [state, setState] = useState<{ cfg: BoothConfig; key: string } | { error: string } | null>(null);

  useEffect(() => {
    const key = new URLSearchParams(window.location.hash.slice(1)).get('k');
    if (!key) {
      setState({ error: 'This edit link is missing its secret key. Use the full edit link you saved.' });
      return;
    }
    fetch(`/api/booths/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'This booth could not be found.' : 'Could not load the booth.');
        const data = await r.json();
        setState({ cfg: sanitizeConfig(data.config, () => true), key });
      })
      .catch((e) => setState({ error: (e as Error).message }));
  }, [id]);

  if (!state) return <div className="booth-msg" style={{ color: 'var(--muted)' }}>Loading your booth…</div>;
  if ('error' in state) {
    return (
      <div className="guest">
        <p style={{ fontSize: 40, margin: 0 }}>😕</p>
        <p>{state.error}</p>
        <Link className="btn btn-primary" href="/">Go home</Link>
      </div>
    );
  }
  return <Designer initial={state.cfg} booth={{ id, key: state.key }} />;
}
