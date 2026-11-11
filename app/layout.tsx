import type { Metadata, Viewport } from 'next';
import { dmsans } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Framely · your own photo booth',
  description:
    'Design your own Photoism-style photo booth: custom frames, stickers and star cutouts. Share a link and take photo strips, GIFs and boomerangs on any phone, tablet or laptop.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fff7f4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={dmsans.className}>{children}</body>
    </html>
  );
}
