'use client';

import { createBrowserSupabaseClient } from '@/lib/supabase';

export default function AuthButton() {
  const handleSignIn = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <button
      onClick={handleSignIn}
      className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-medium text-slate-950 hover:bg-emerald-400 transition"
    >
      Sign In with Google
    </button>
  );
}
