// Which release the server is running, so a page left open from an older release can ask to be reloaded.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ build: process.env.NEXT_PUBLIC_BUILD ?? '' }, { headers: { 'Cache-Control': 'no-store' } });
}
