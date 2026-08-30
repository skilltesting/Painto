'use client';

import { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';

interface AuthButtonProps {
  redirectTo?: string;
}

export default function AuthButton({ redirectTo = '/draw' }: AuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    try {
      setIsLoading(true);
      const supabase = createBrowserSupabaseClient();
      
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      callbackUrl.searchParams.set('next', redirectTo);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        console.error('OAuth error:', error.message);
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Sign-in error:', err);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleSignIn}
      disabled={isLoading}
      className="flex w-full items-center justify-center rounded-lg bg-emerald-500 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isLoading ? 'Connecting...' : 'Sign In with Google'}
    </button>
  );
}

// Named alias for backward compatibility
export const GoogleSignInButton = AuthButton;

// Standalone SignOutButton export to prevent missing export errors elsewhere
export function SignOutButton() {
  const handleSignOut = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 transition"
    >
      Sign Out
    </button>
  );
}
