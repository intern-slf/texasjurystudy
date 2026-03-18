import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSessionCompletedEmail } from "@/lib/mail";

export async function GET(req: NextRequest) {
  // Protect the endpoint — Vercel passes this header automatically
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nowUTC = new Date();
  const todayStr = nowUTC.toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch sessions with intent ON and email not yet sent (today or earlier)
  const { data: pendingSessions, error } = await supabaseAdmin
    .from("sessions")
    .select("id, session_date")
    .lte("session_date", todayStr)          // today or past
    .eq("send_completion_email", true)
    .eq("completion_email_sent", false);

  if (error) {
    console.error("[cron] Failed to fetch pending sessions:", error);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  if (!pendingSessions?.length) {
    return NextResponse.json({ sent: 0, message: "No pending sessions" });
  }

  let sentCount = 0;

  for (const session of pendingSessions) {
    try {
      // For today's sessions, check if the latest end_time has passed
      if (session.session_date === todayStr) {
        const { data: scases } = await supabaseAdmin
          .from("session_cases")
          .select("end_time")
          .eq("session_id", session.id);

        const endTimes = (scases ?? [])
          .map((sc) => sc.end_time)
          .filter(Boolean)
          .sort();

        if (endTimes.length) {
          const latestEnd = endTimes[endTimes.length - 1]; // "HH:MM:SS"
          const [h, m, s] = latestEnd.split(":").map(Number);
          const sessionEndUTC = new Date(session.session_date);
          sessionEndUTC.setUTCHours(h, m, s ?? 0, 0);

          if (nowUTC < sessionEndUTC) {
            // Session hasn't ended yet — skip for now
            console.log(`[cron] Session ${session.id} not ended yet (ends ${latestEnd} UTC)`);
            continue;
          }
        }
      }

      // Fetch cases in this session
      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("case_id")
        .eq("session_id", session.id);

      const caseIds = (sessionCases ?? []).map((sc) => sc.case_id);
      if (!caseIds.length) continue;

      const { data: caseRows } = await supabaseAdmin
        .from("cases")
        .select("id, title, user_id")
        .in("id", caseIds);

      if (!caseRows?.length) continue;

      const sessionDate = new Date(session.session_date).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });

      // Group titles by presenter, deduplicated
      const presenterMap = new Map<string, string[]>();
      for (const c of caseRows) {
        if (!c.user_id) continue;
        if (!presenterMap.has(c.user_id)) presenterMap.set(c.user_id, []);
        presenterMap.get(c.user_id)!.push(c.title);
      }

      if (presenterMap.size === 0) {
        console.error(`[cron] No user_id found on cases for session ${session.id}`);
        continue;
      }

      for (const [userId, titles] of presenterMap) {
        let email: string | null = null;

        // Primary: auth.users
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
        email = userData?.user?.email ?? null;

        // Fallback: profiles table
        if (!email) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("id", userId)
            .single();
          email = (profile as any)?.email ?? null;
        }

        if (email) {
          await sendSessionCompletedEmail(email, titles, sessionDate);
          console.log(`[cron] Sent completion email to ${email} for session ${session.id}`);
          sentCount++;
        } else {
          console.error(`[cron] No email for user_id ${userId}`);
        }
      }

      // Mark as sent
      await supabaseAdmin
        .from("sessions")
        .update({ completion_email_sent: true })
        .eq("id", session.id);

    } catch (e) {
      console.error(`[cron] Failed for session ${session.id}:`, e);
    }
  }

  return NextResponse.json({ sent: sentCount });
}
