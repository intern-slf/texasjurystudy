'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallbackPage() {
    const router = useRouter();

    useEffect(() => {
        const handleCallback = async () => {
            const supabase = createClient();

            if (window.location.hash) {
                await supabase.auth.getSession();
            }

            // After confirming account, send user to login so they can sign in
            router.push('/auth/login');
        };

        handleCallback();
    }, [router]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <div className="animate-pulse text-lg">Verifying session...</div>
        </div>
    );
}
