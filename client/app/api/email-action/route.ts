import { NextRequest, NextResponse } from "next/server";
import { verifyEmailActionToken } from "@/lib/emailActionToken";
import { updateInviteStatus } from "@/lib/participant/updateInviteStatus";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return html(errorPage("Missing Token", "No action token was provided in this link."));
  }

  const secret = process.env.EMAIL_ACTION_SECRET;
  if (!secret) {
    console.error("[email-action] EMAIL_ACTION_SECRET is not set");
    return html(errorPage("Configuration Error", "The server is not configured correctly. Please contact support."), 500);
  }

  const payload = verifyEmailActionToken(token, secret);
  if (!payload) {
    return html(
      errorPage(
        "Link Expired or Invalid",
        "This link has expired or is not valid. Links expire after 7 days. Please log in to your participant dashboard to update your response."
      ),
      400
    );
  }

  const { inviteId, action } = payload;

  try {
    const { data: row, error } = await supabaseAdmin
      .from("session_participants")
      .select("invite_status, participant_id")
      .eq("id", inviteId)
      .single();

    if (error || !row) {
      return html(errorPage("Invitation Not Found", "This invitation could not be found. It may have been removed."), 404);
    }

    // Generate a magic link so the dashboard button logs them in automatically
    const magicLink = await getMagicLink(row.participant_id);

    if (row.invite_status === "accepted" || row.invite_status === "declined") {
      return html(alreadyRespondedPage(row.invite_status, magicLink));
    }

    const result = await updateInviteStatus(inviteId, action);
    if (result && "blocked" in result && result.blocked) {
      return html(sessionFullPage(magicLink));
    }
    return html(successPage(action, magicLink));
  } catch (err) {
    console.error("[email-action] Error updating invite status:", err);
    return html(errorPage("Something Went Wrong", "We could not update your response. Please try again or contact support."), 500);
  }
}

async function getMagicLink(participantId: string): Promise<string> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const fallback = `${appUrl}/dashboard/participant`;

  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participantId);
    const email = userData?.user?.email;
    if (!email) return fallback;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appUrl}/dashboard/participant` },
    });

    if (error || !data?.properties?.action_link) return fallback;
    return data.properties.action_link;
  } catch {
    return fallback;
  }
}

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function page(title: string, content: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} | Texas Jury Study</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:#1e3a8a;border-radius:8px 8px 0 0;padding:28px 36px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Texas Jury Study</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:40px 36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;text-align:center;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${year} Texas Jury Study. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function successPage(action: "accepted" | "declined", dashboardUrl: string): string {
  const isAccepted = action === "accepted";
  const color = isAccepted ? "#16a34a" : "#dc2626";
  const bgColor = isAccepted ? "#f0fdf4" : "#fef2f2";
  const headline = isAccepted ? "You're In!" : "Invitation Declined";
  const message = isAccepted
    ? "Thank you for accepting. We look forward to seeing you at the session. You will receive a Zoom link closer to the date."
    : "We have recorded your response. Thank you for letting us know — we hope to see you at a future session.";

  return page(headline, `
    <div style="width:64px;height:64px;border-radius:50%;background-color:${bgColor};border:2px solid ${color};margin:0 auto 20px;font-size:28px;line-height:64px;">${isAccepted ? "✓" : "✕"}</div>
    <h1 style="margin:0 0 12px;font-size:26px;font-weight:700;color:${color};">${headline}</h1>
    <p style="margin:0 0 28px;font-size:16px;color:#475569;line-height:1.6;">${message}</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#2563eb;text-decoration:none;border-radius:6px;">View My Dashboard</a>
  `);
}

function alreadyRespondedPage(existingAction: string, dashboardUrl: string): string {
  return page("Already Responded", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#f0f9ff;border:2px solid #0ea5e9;margin:0 auto 20px;font-size:28px;line-height:64px;">ℹ</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#0369a1;">You Have Already Responded</h1>
    <p style="margin:0 0 8px;font-size:16px;color:#475569;">You already <strong>${existingAction}</strong> this invitation.</p>
    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">To change your response, please log in to your participant dashboard.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#2563eb;text-decoration:none;border-radius:6px;">Go to Dashboard</a>
  `);
}

function sessionFullPage(dashboardUrl: string): string {
  return page("Session Full", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#eff6ff;border:2px solid #2563eb;margin:0 auto 20px;font-size:28px;line-height:64px;">📋</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#1e3a8a;">Session Is Full</h1>
    <p style="margin:0 0 8px;font-size:16px;color:#475569;line-height:1.6;">Thank you for your interest, but this session has already reached its participant capacity.</p>
    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">Don't worry — you will be considered for the next available session that matches your profile.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#2563eb;text-decoration:none;border-radius:6px;">Go to Dashboard</a>
  `);
}

function errorPage(title: string, message: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

  return page(title, `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#fef2f2;border:2px solid #dc2626;margin:0 auto 20px;font-size:28px;line-height:64px;">!</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#dc2626;">${title}</h1>
    <p style="margin:0 0 28px;font-size:15px;color:#475569;line-height:1.6;">${message}</p>
    <a href="${appUrl}/dashboard/participant" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#2563eb;text-decoration:none;border-radius:6px;">Go to Dashboard</a>
  `);
}
