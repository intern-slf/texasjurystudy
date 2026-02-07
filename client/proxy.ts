import { updateSession } from "@/lib/supabase/proxy";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SerializeOptions } from "cookie";

export async function proxy(request: NextRequest) {
  // 1️⃣ Keep Supabase session in sync
  const response = await updateSession(request);

  // 2️⃣ Create Supabase client for auth check
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(
          name: string,
          value: string,
          options: SerializeOptions
        ) {
          response.cookies.set({ name, value, ...options });
        },
        remove(
          name: string,
          options: SerializeOptions
        ) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const origin = request.nextUrl.origin;

  // 🔒 Protect dashboard routes
  if (pathname.startsWith("/dashboard") && !user) {
    return NextResponse.redirect(
      new URL("/auth/login", origin)
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
