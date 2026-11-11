import { NextResponse } from 'next/server';
import { cleanConfig, keyMatches, readBooth, storageReady, writeBooth } from '@/lib/store';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const booth = await readBooth(id);
  if (!booth) return NextResponse.json({ error: 'Booth not found' }, { status: 404 });
  return NextResponse.json({ id: booth.id, config: booth.config, updatedAt: booth.updatedAt });
}

export async function PUT(request: Request, { params }: Ctx) {
  if (!storageReady()) return NextResponse.json({ error: 'Storage is not set up yet.' }, { status: 503 });
  const { id } = await params;
  const text = await request.text();
  if (text.length > 300_000) return NextResponse.json({ error: 'Booth is too large' }, { status: 413 });
  let body: { config?: unknown; key?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const booth = await readBooth(id);
  if (!booth) return NextResponse.json({ error: 'Booth not found' }, { status: 404 });
  if (!keyMatches(body.key, booth.editKeyHash)) {
    return NextResponse.json({ error: 'This edit link is not valid.' }, { status: 403 });
  }

  const updatedAt = new Date().toISOString();
  await writeBooth({ ...booth, config: cleanConfig(body.config), updatedAt });
  return NextResponse.json({ ok: true, updatedAt });
}
