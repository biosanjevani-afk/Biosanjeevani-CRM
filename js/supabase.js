import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../supabase-config.js?v=20260902a';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || SUPABASE_URL.includes('your-project')) {
  throw new Error('Supabase is not configured. Copy supabase-config.example.js to supabase-config.js and add your publishable key.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

