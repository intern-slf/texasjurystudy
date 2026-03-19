import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendSessionCompletedEmail } from "@/lib/mail";

export async function GET(req: NextRequest) {
  // Protect the endpoint with a secret so only the cron scheduler can call it
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const debug = req.nextUrl.searchParams.get("debug") === "1";
  // force=1 re-sends even if completion_email_sent is already true (for testing)
  const force = req.nextUrl.searchParams.get("force") === "1";

  try {
    // Debug: dump all sessions raw
    if (debug) {
      const { data: allSessions, error: allErr } = await supabaseAdmin
        .from("sessions")
        .select("id, session_date, completion_notification_enabled, completion_email_sent");
      return NextResponse.json({ debug: true, allSessions, allErr });
    }

    // Find eligible sessions
    let query = supabaseAdmin
      .from("sessions")
      .select("id, session_date")
      .eq("completion_notification_enabled", true);

    if (!force) {
      query = query.neq("completion_email_sent", true);
    }

    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) throw sessionsError;
    if (!sessions?.length) {
      return NextResponse.json({ message: "No pending sessions", processed: 0 });
    }

    const now = new Date();
    let processed = 0;

    for (const session of sessions) {
      // Get all cases for this session with their end times
      const { data: sessionCases } = await supabaseAdmin
        .from("session_cases")
        .select("case_id, end_time")
        .eq("session_id", session.id);

      if (!sessionCases?.length) continue;

      // Find the latest end time across all cases
      const endTimes = sessionCases
        .map((sc) => sc.end_time as string)
        .filter(Boolean)
        .sort();

      const lastEndTime = endTimes[endTimes.length - 1]; // "HH:MM" or "HH:MM:SS" UTC

      // Build the full UTC datetime for when the session ends
      const sessionEndUtc = new Date(
        `${session.session_date}T${lastEndTime.slice(0, 5)}:00Z`
      );

      // Only send if the session has actually ended
      if (now < sessionEndUtc) continue;

      // Fetch case details (title + presenter user_id)
      const caseIds = sessionCases.map((sc) => sc.case_id);
      const { data: caseRows } = await supabaseAdmin
        .from("cases")
        .select("id, title, user_id")
        .in("id", caseIds);

      if (!caseRows?.length) continue;

      const sessionDateStr = new Date(session.session_date).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      // Group case titles by presenter (one email per presenter)
      const presenterMap = new Map<string, string[]>();
      for (const c of caseRows) {
        if (!c.user_id) continue;
        if (!presenterMap.has(c.user_id)) presenterMap.set(c.user_id, []);
        presenterMap.get(c.user_id)!.push(c.title);
      }

      let emailSent = false;
      const emailLog: { presenterId: string; email: string | null; status: string }[] = [];

      for (const [presenterId, titles] of presenterMap) {
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(presenterId);
          const email = userData?.user?.email ?? null;
          if (email) {
            await sendSessionCompletedEmail(email, titles, sessionDateStr);
            console.log(`[cron] Completion email sent to ${email} for session ${session.id}`);
            emailLog.push({ presenterId, email, status: "sent" });
            emailSent = true;
          } else {
            emailLog.push({ presenterId, email: null, status: "no_email_found" });
          }
        } catch (e) {
          console.error(`[cron] Failed to email presenter ${presenterId}:`, e);
          emailLog.push({ presenterId, email: null, status: `error: ${String(e)}` });
        }
      }

      // Mark as sent so we never send again (skip if force mode)
      if (emailSent && !force) {
        await supabaseAdmin
          .from("sessions")
          .update({ completion_email_sent: true })
          .eq("id", session.id);
      }

      if (emailSent) processed++;
      console.log(`[cron] Session ${session.id} emailLog:`, emailLog);
      // Attach log to response for debugging
      (session as any)._emailLog = emailLog;
    }

    return NextResponse.json({ message: "Done", processed, sessions });
  } catch (err) {
    console.error("[cron] session-completion error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
