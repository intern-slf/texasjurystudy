"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendApprovalEmail } from "@/lib/mail";

export async function proposeSchedule(caseId: string, isoDate: string) {
    const supabase = await createClient();

    await supabase
        .from("cases")
        .update({
            admin_scheduled_at: isoDate,
            schedule_status: "pending",
        })
        .eq("id", caseId);

    revalidatePath("/dashboard/Admin");
}

export async function unapproveCase(formData: FormData) {
    const caseId = formData.get("caseId") as string;
    const supabase = await createClient();

    await supabase
        .from("cases")
        .update({ admin_status: "all" })
        .eq("id", caseId);

    revalidatePath("/dashboard/Admin");
}

export async function approveCase(formData: FormData) {
    const caseId = formData.get("caseId") as string;
    const supabase = await createClient();

    const { data: updatedCase } = await supabase
        .from("cases")
        .update({ admin_status: "approved" })
        .eq("id", caseId)
        .select("title, user_id")
        .single();

    if (updatedCase) {
        const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", updatedCase.user_id)
            .single();

        if (profile?.email) {
            await sendApprovalEmail(profile.email, updatedCase.title);
        }
    }

    revalidatePath("/dashboard/Admin");
}
