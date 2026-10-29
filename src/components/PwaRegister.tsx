'use client';
import { useEffect } from 'react';

/** Registers the (cache-free) service worker that makes the app installable. */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
