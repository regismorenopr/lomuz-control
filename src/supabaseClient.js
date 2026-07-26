import { createClient } from '@supabase/supabase-js';

// Projeto: Lomuz Control Financeiro (Supabase)
const SUPABASE_URL = 'https://kgbvpbedgnwnaoqevdbh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FCYBqyLoZL08jOV5R7eK6A_H86av0TD';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
