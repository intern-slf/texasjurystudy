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
    .select("title, user_id, filters, hours_requested")
    .single();

  if (error) {
    console.error("[approveCaseAction] Failed to update case:", error);
    throw error;
  }

  if (updatedCase) {
    // Get requestee email from auth.users (most reliable)
    let requesteeEmail: string | null = null;

    try {
      const { data: userData, error: authError } =
        await supabaseAdmin.auth.admin.getUserById(updatedCase.user_id);
      if (authError) {
        console.error("[approveCaseAction] Auth lookup error:", authError);
      }
      requesteeEmail = userData?.user?.email ?? null;
    } catch (e) {
      console.error("[approveCaseAction] supabaseAdmin call failed:", e);
    }

    // Fallback to profiles table
    if (!requesteeEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", updatedCase.user_id)
        .single();
      requesteeEmail = profile?.email ?? null;
    }

    if (requesteeEmail) {
      try {
        await sendApprovalEmail(requesteeEmail, updatedCase.title);
        console.log("[approveCaseAction] Approval email sent to:", requesteeEmail);
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
    let requesteeEmail: string | null = null;

    try {
      const { data: userData, error: authError } =
        await supabaseAdmin.auth.admin.getUserById(updatedCase.user_id);
      if (authError) {
        console.error("[rejectCaseAction] Auth lookup error:", authError);
      }
      requesteeEmail = userData?.user?.email ?? null;
    } catch (e) {
      console.error("[rejectCaseAction] supabaseAdmin call failed:", e);
    }

    if (!requesteeEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", updatedCase.user_id)
        .single();
      requesteeEmail = profile?.email ?? null;
    }

    if (requesteeEmail) {
      try {
        await sendRejectionEmail(requesteeEmail, updatedCase.title, reason);
        console.log("[rejectCaseAction] Rejection email sent to:", requesteeEmail);
      } catch (emailErr) {
        console.error("[rejectCaseAction] Failed to send rejection email:", emailErr);
      }
    } else {
      console.error("[rejectCaseAction] No email found for user_id:", updatedCase.user_id);
    }
  }

  revalidatePath("/dashboard/Admin");
}
