import { redirect } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { createClient } from '@/lib/supabase/supabase';
import { GoogleSignInButton } from '@/components/AuthButton';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/draw');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-graphite-950 px-6">
      <div className="w-full max-w-sm rounded-xl border border-graphite-700 bg-graphite-900 p-8 shadow-panel">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <PenLine className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-graphite-50">Inkwell Studio</h1>
            <p className="text-xs text-graphite-400">Layered painting, saved to the cloud.</p>
          </div>
        </div>

        <GoogleSignInButton />

        <p className="mt-4 text-center text-xs text-graphite-500">
          Your drawings autosave to your account as you work.
        </p>
      </div>
    </main>
  );
}

