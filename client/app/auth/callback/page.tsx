'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AuthShell } from '@/components/auth-shell';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();

      if (window.location.hash) {
        await supabase.auth.getSession();
      }

      router.push('/auth/login');
    };

    handleCallback();
  }, [router]);

  return (
    <AuthShell
      variant="centered"
      tagline="One moment"
      title="Verifying your"
      accent="session."
      description="Hang tight — we'll redirect you as soon as your session is confirmed."
    >
      <Card className="border border-border/60 bg-background/80 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="text-center space-y-3 pb-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <CardTitle className="text-xl">Verifying session…</CardTitle>
          <CardDescription>
            This usually takes only a second. You&apos;ll be redirected automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
