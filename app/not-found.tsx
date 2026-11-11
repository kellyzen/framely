import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="guest">
      <p style={{ fontSize: 44, margin: 0 }}>🪞</p>
      <h1 style={{ margin: 0 }}>Booth not found</h1>
      <p className="hint">The link may be wrong, or the booth was removed.</p>
      <Link className="btn btn-primary" href="/">Make your own booth</Link>
    </main>
  );
}
