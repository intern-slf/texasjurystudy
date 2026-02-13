'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleCallback = async () => {
            const supabase = createClient();
            
            // Check for hash parameters (implicit flow / magic link default sometimes)
            if (window.location.hash) {
                const { data, error } = await supabase.auth.getSession();
                if (data.session) {
                    router.push('/dashboard');
                } else {
                     // Try to recover session from the hash if getSession didn't pick it up automatically
                     // (Supabase client usually handles this on initialization if autoRefreshToken is on)
                     // If we are here, likely the client auto-detected the hash.
                     // Just redirect to dashboard and let middleware handle protection.
                     router.push('/dashboard');
                }
            } else {
                 // Fallback
                 router.push('/dashboard');
            }
        };

        handleCallback();
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="animate-pulse text-lg">Verifying session...</div>
        </div>
    );
}
