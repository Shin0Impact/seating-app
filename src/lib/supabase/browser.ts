import { createBrowserClient } from '@supabase/ssr';
import { supabaseKey, supabaseUrl } from './env';

export const browserClient = () => createBrowserClient(supabaseUrl, supabaseKey);
