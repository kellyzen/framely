import type { Metadata } from 'next';
import EditLoader from '@/components/EditLoader';

export const metadata: Metadata = { title: 'Edit booth · Framely', robots: { index: false } };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditLoader id={id} />;
}
