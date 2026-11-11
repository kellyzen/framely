import { NextResponse } from 'next/server';
import { cleanConfig, hashKey, newId, newKey, storageReady, writeBooth } from '@/lib/store';

export async function POST(request: Request) {
  if (!storageReady()) {
    return NextResponse.json(
      { error: 'Sharing is not set up yet. Connect a Vercel Blob store to this project.' },
      { status: 503 },
    );
  }
  const text = await request.text();
  if (text.length > 300_000) return NextResponse.json({ error: 'Booth is too large' }, { status: 413 });
  let body: { config?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const id = newId();
  const key = newKey();
  const now = new Date().toISOString();
  await writeBooth({ id, config: cleanConfig(body.config), editKeyHash: hashKey(key), createdAt: now, updatedAt: now });
  return NextResponse.json({ id, key });
}
