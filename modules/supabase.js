// Supabase Configuration
const SUPABASE_URL = 'https://onajvhbgnirafguahgtn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_E_3N2QWiSidPBwk9LRmLsA_EUFiKTA9';

// Initialize Supabase client
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
