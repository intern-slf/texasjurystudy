import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient(); // ✅ FIX

  await supabase
    .from("session_participants")
    .update({
      invite_status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  return NextResponse.redirect(
    new URL(
      "/dashboard/participant/sessions",
      process.env.NEXT_PUBLIC_SITE_URL!
    )
  );
}
