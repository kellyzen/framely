'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { forgetBooth, getMyBooths, type MyBooth } from '@/lib/myBooths';

export default function MyBooths() {
  const [list, setList] = useState<MyBooth[]>([]);
  useEffect(() => setList(getMyBooths()), []);
  if (!list.length) return null;

  return (
    <section className="my-booths">
      <h2 className="section-title">Your booths (on this device)</h2>
      {list.map((b) => (
        <div key={b.id} className="booth-item">
          <strong className="grow">{b.title}</strong>
          <Link className="btn btn-sm" href={`/b/${b.id}`}>Open booth</Link>
          <Link className="btn btn-sm btn-dark" href={`/edit/${b.id}#k=${b.key}`}>Edit</Link>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              if (!confirm('Remove this booth from the list? (The booth itself stays online.)')) return;
              forgetBooth(b.id);
              setList(getMyBooths());
            }}
          >
            ✕
          </button>
        </div>
      ))}
    </section>
  );
}
