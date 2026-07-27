import { createClient } from '@supabase/supabase-js';

// Projeto: Lomuz Control Financeiro (Supabase)
const SUPABASE_URL = 'https://kgbvpbedgnwnaoqevdbh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FCYBqyLoZL08jOV5R7eK6A_H86av0TD';

// "Lembrar de mim": quando marcado, a sessão fica em localStorage (sobrevive
// a fechar o navegador); quando desmarcado, fica só em sessionStorage (some
// ao fechar a aba). O LoginScreen grava essa preferência antes de entrar.
const REMEMBER_KEY = 'lomuz-remember';

const dynamicStorage = {
  getItem: (key) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false';
    return (remember ? localStorage : sessionStorage).getItem(key);
  },
  setItem: (key, value) => {
    const remember = localStorage.getItem(REMEMBER_KEY) !== 'false';
    (remember ? localStorage : sessionStorage).setItem(key, value);
  },
  removeItem: (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: dynamicStorage, persistSession: true, autoRefreshToken: true },
});
