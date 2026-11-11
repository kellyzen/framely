import Link from 'next/link';
import { LOGO_FONT } from '@/lib/fonts';
import MyBooths from '@/components/MyBooths';

const FEATURES = [
  { icon: '🌟', title: 'Star cutouts', text: 'Upload the bride, an idol, anyone. Remove the background automatically or cut it out yourself.' },
  { icon: '🎀', title: 'Your own frame', text: 'Colours, gradients, patterns, film style, emoji and text stickers, titles. Everything is optional.' },
  { icon: '📸', title: 'Photo strips', text: '1 to 6 shots with a countdown, plus filters like vintage, retro, bright and black & white.' },
  { icon: '🔁', title: 'GIFs & boomerangs', text: 'Every strip also becomes a GIF. Or shoot a boomerang that loops back and forth.' },
  { icon: '🔗', title: 'Share one link', text: 'Guests scan a QR code and use the booth on their own phone. Photos stay on their device.' },
  { icon: '💻', title: 'Any device', text: 'Works on phones, tablets and laptops, using the front or back camera.' },
];

export default function Home() {
  return (
    <>
      <header className="topbar">
        <span className={`logo ${LOGO_FONT.className}`}>Framely</span>
        <Link href="/create" className="btn btn-sm btn-primary">Create a booth</Link>
      </header>
      <main className="landing">
        <section className="hero">
          <div>
            <h1>
              Your own photo booth, <em>in a link.</em>
            </h1>
            <p>Design a Photoism-style frame, add your favourite people, and let everyone at the party snap strips on their phones.</p>
            <div className="row">
              <Link href="/create" className="btn btn-primary btn-lg">Create your booth</Link>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="mock-strip" style={{ background: '#F7D6E0' }}>
              <div style={{ background: '#fff' }}>👰</div>
              <div style={{ background: '#fff' }}>🥂</div>
              <div style={{ background: '#fff' }}>💃</div>
              <div style={{ background: '#fff' }}>💍</div>
            </div>
            <div className="mock-strip" style={{ background: '#16151F' }}>
              <div style={{ background: '#3a3550' }}>🪩</div>
              <div style={{ background: '#3a3550' }}>✨</div>
              <div style={{ background: '#3a3550' }}>😎</div>
              <div style={{ background: '#3a3550' }}>🎉</div>
            </div>
          </div>
        </section>

        <section className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="card feature">
              <span>{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </section>

        <MyBooths />
      </main>
    </>
  );
}
