'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** While a confirmed family is waiting to be scanned, quietly re-check so the map shows up right after the scan. */
export default function ScanWatcher() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, 5000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
