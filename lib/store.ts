import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BlobNotFoundError, head, put } from '@vercel/blob';
import { sanitizeConfig } from './config';
import type { BoothConfig, StoredBooth } from './types';

export const BOOTH_ID = /^[A-Za-z0-9]{10}$/;

export function storageReady(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Only images that live in a Vercel Blob store may be referenced by a booth. */
export function isAllowedSrc(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === 'https:' && u.hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function cleanConfig(input: unknown): BoothConfig {
  return sanitizeConfig(input, isAllowedSrc);
}

export function newId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from(randomBytes(10), (b) => chars[b % chars.length]).join('');
}

export function newKey(): string {
  return randomBytes(24).toString('base64url');
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function keyMatches(key: unknown, hash: string): boolean {
  if (typeof key !== 'string' || !key) return false;
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const path = (id: string) => `booths/${id}.json`;

export async function readBooth(id: string): Promise<StoredBooth | null> {
  if (!BOOTH_ID.test(id) || !storageReady()) return null;
  try {
    const meta = await head(path(id));
    const res = await fetch(`${meta.url}?v=${new Date(meta.uploadedAt).getTime()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as StoredBooth;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

export async function writeBooth(booth: StoredBooth): Promise<void> {
  await put(path(booth.id), JSON.stringify(booth), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}
