import Link from 'next/link';
import Scanner from '@/components/Scanner';

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="page narrow">
      <div className="row between"><h1>مسح الدخول</h1><Link href="/events">← مناسباتي</Link></div>
      <Scanner />
      <p className="muted" hidden>{id}</p>
    </main>
  );
}
