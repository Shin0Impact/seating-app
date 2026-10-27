'use server';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';

export async function signOut() {
  await (await serverClient()).auth.signOut();
  redirect('/');
}
