"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/mail";
import { requireAdmin } from "@/lib/requireAdmin";
import { localToUTC } from "@/lib/timezone";
import { revalidatePath } from "next/cache";

// Every export here is an admin action, and starts with requireAdmin(): as server
// actions they can be called by anyone signed in, with any case's id. RLS doesn't stop
// a firm on its own case, since its login may write that row.

export async function approveCaseAction(caseId: string) {
  await requireAdmin();

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
  await requireAdmin();

  // The firm is emailed the reason, so it can't be blank. RejectCaseButton refuses an
  // empty one too.
  if (typeof reason !== "string" || !reason.trim()) {
    throw new Error("A rejection reason is required");
  }

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

/** The Approved tab's "Send": proposes a session time for the firm to confirm. */
export async function proposeScheduleAction(formData: FormData) {
  await requireAdmin();

  const caseId = formData.get("caseId") as string;
  const raw = formData.get("scheduled_at") as string; // "YYYY-MM-DDTHH:MM"
  const tz = formData.get("tz") as string || "UTC";

  const [datePart, timePart] = raw.split("T");
  const adminScheduledAt = localToUTC(datePart, timePart, tz);

  const supabase = await createClient();

  await supabase
    .from("cases")
    .update({
      admin_scheduled_at: adminScheduledAt,
      schedule_status: "pending",
    })
    .eq("id", caseId);

  revalidatePath("/dashboard/Admin");
}

/** The Approved tab's "Unapprove": sends the case back to the Requested queue. */
export async function unapproveCaseAction(formData: FormData) {
  await requireAdmin();

  const caseId = formData.get("caseId") as string;
  const supabase = await createClient();

  await supabase
    .from("cases")
    .update({ admin_status: "all" })
    .eq("id", caseId);

  revalidatePath("/dashboard/Admin");
}
