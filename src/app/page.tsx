import { redirect } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase';
import AuthButton from '@/components/AuthButton';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/draw');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <PenLine className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-50">Inkwell Studio</h1>
            <p className="text-xs text-slate-400">Layered painting, saved to the cloud.</p>
          </div>
        </div>

        <AuthButton />

        <p className="mt-4 text-center text-xs text-slate-500">
          Your drawings autosave to your account as you work.
        </p>
      </div>
    </main>
  );
}




