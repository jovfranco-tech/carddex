import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

const noopPromise = async () => ({ data: null, error: null });

const safeMock = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: noopPromise,
    signOut: noopPromise,
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        single: noopPromise,
      }),
    }),
    update: () => ({
      eq: noopPromise,
    }),
  }),
} as any;

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : safeMock;
