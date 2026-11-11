import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import GuestBooth from '@/components/GuestBooth';
import { readBooth } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const booth = await readBooth(id).catch(() => null);
  const title = booth?.config.text.title.trim() || 'Photo booth';
  return {
    title: `${title} · Framely`,
    description: 'Tap to open the photo booth and take a photo strip.',
    robots: { index: false },
  };
}

export default async function BoothPage({ params }: Props) {
  const { id } = await params;
  const booth = await readBooth(id);
  if (!booth) notFound();
  return <GuestBooth config={booth.config} />;
}
