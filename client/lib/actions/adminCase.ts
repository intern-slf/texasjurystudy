"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/mail";
import { revalidatePath } from "next/cache";

export async function approveCaseAction(caseId: string) {
  const supabase = await createClient();

  const { data: updatedCase, error } = await supabase
    .from("cases")
    .update({ admin_status: "approved" })
    .eq("id", caseId)
    .select("title, user_id")
    .single();

  if (error) {
    console.error("[approveCaseAction] Failed to update case:", error);
    throw error;
  }

  if (updatedCase) {
    // Get presenter email from auth.users (most reliable)
    let presenterEmail: string | null = null;

    try {
      const { data: userData, error: authError } =
        await supabaseAdmin.auth.admin.getUserById(updatedCase.user_id);
      if (authError) {
        console.error("[approveCaseAction] Auth lookup error:", authError);
      }
      presenterEmail = userData?.user?.email ?? null;
    } catch (e) {
      console.error("[approveCaseAction] supabaseAdmin call failed:", e);
    }

    // Fallback to profiles table
    if (!presenterEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", updatedCase.user_id)
        .single();
      presenterEmail = profile?.email ?? null;
    }

    if (presenterEmail) {
      try {
        await sendApprovalEmail(presenterEmail, updatedCase.title);
        console.log("[approveCaseAction] Approval email sent to:", presenterEmail);
      } catch (emailErr) {
        console.error("[approveCaseAction] Failed to send approval email:", emailErr);
      }
    } else {
      console.error("[approveCaseAction] No email found for user_id:", updatedCase.user_id);
    }
  }

  revalidatePath("/dashboard/Admin");
}

export async function rejectCaseAction(caseId: string, reason: string) {
  const supabase = await createClient();

  const { data: updatedCase, error } = await supabase
    .from("cases")
    .update({ admin_status: "rejected", rejection_reason: reason })
    .eq("id", caseId)
    .select("title, user_id")
    .single();

  if (error) {
    console.error("[rejectCaseAction] Failed to update case:", error);
    throw error;
  }

  if (updatedCase) {
    let presenterEmail: string | null = null;

    try {
      const { data: userData, error: authError } =
        await supabaseAdmin.auth.admin.getUserById(updatedCase.user_id);
      if (authError) {
        console.error("[rejectCaseAction] Auth lookup error:", authError);
      }
      presenterEmail = userData?.user?.email ?? null;
    } catch (e) {
      console.error("[rejectCaseAction] supabaseAdmin call failed:", e);
    }

    if (!presenterEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", updatedCase.user_id)
        .single();
      presenterEmail = profile?.email ?? null;
    }

    if (presenterEmail) {
      try {
        await sendRejectionEmail(presenterEmail, updatedCase.title, reason);
        console.log("[rejectCaseAction] Rejection email sent to:", presenterEmail);
      } catch (emailErr) {
        console.error("[rejectCaseAction] Failed to send rejection email:", emailErr);
      }
    } else {
      console.error("[rejectCaseAction] No email found for user_id:", updatedCase.user_id);
    }
  }

  revalidatePath("/dashboard/Admin");
}
