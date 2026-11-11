import type { Metadata } from 'next';
import Designer from '@/components/Designer';

export const metadata: Metadata = { title: 'Create a booth · Framely' };

export default function CreatePage() {
  return <Designer />;
}
