import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

/**
 * FocusGroup Secure Confirmation Handler
 * Handles: signup, recovery, invite, and email change verifications.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  
  // Dynamic redirect: Default to dashboard, but allow override
  const next = searchParams.get("next") ?? "/dashboard";

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!error) {
      // Relative redirect works perfectly for Next.js internal routing
      return redirect(next);
    } else {
      // Pass the specific error message to your custom error page
      return redirect(`/auth/error?error=${encodeURIComponent(error.message)}`);
    }
  }

  // Fallback for missing or malformed tokens
  return redirect(`/auth/error?error=Invalid+or+missing+verification+token`);
}