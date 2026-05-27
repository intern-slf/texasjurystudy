import { NextRequest, NextResponse } from "next/server";
import { verifyReactivationToken } from "@/lib/reactivationToken";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return html(errorPage("Missing Token", "No action token was provided in this link."));
  }

  const secret = process.env.EMAIL_ACTION_SECRET;
  if (!secret) {
    console.error("[reactivate] EMAIL_ACTION_SECRET is not set");
    return html(
      errorPage("Configuration Error", "The server is not configured correctly. Please contact support."),
      500
    );
  }

  const payload = verifyReactivationToken(token, secret);
  if (!payload) {
    return html(
      errorPage(
        "Link Expired or Invalid",
        "This link has expired or is not valid. Reactivation links expire after 30 days. Please contact Texas Jury Study if you would still like to participate."
      ),
      400
    );
  }

  const { participantId, action } = payload;

  try {
    const { data: row, error } = await supabaseAdmin
      .from("jury_participants")
      .select("user_id, reactivation_status, paypal_username, driver_license_number, driver_license_image_url")
      .eq("user_id", participantId)
      .single();

    if (error || !row) {
      return html(
        errorPage("Participant Not Found", "We could not locate your record. Please contact support."),
        404
      );
    }

    // Already responded — show what they previously chose, don't overwrite.
    if (row.reactivation_status === "yes" || row.reactivation_status === "no") {
      return html(submittedPage(row.reactivation_status, true));
    }

    // Mirror session-accept gating: if user said YES, require complete profile
    // (PayPal + DL) before recording reactivation. Leaves status as "pending"
    // so they can re-click the link after updating their profile.
    if (action === "yes") {
      const missing: string[] = [];
      if (!row.driver_license_number || !row.driver_license_image_url) missing.push("dl");
      if (!row.paypal_username) missing.push("paypal");

      if (missing.length > 0) {
        const magicLink = await getMagicLink(participantId);
        return html(missingProfilePage(missing, magicLink));
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from("jury_participants")
      .update({
        reactivation_status: action,
        reactivation_confirmed_at: new Date().toISOString(),
      })
      .eq("user_id", participantId)
      .eq("reactivation_status", "pending");

    if (updateError) {
      console.error("[reactivate] Failed to update participant:", updateError);
      return html(
        errorPage(
          "Something Went Wrong",
          "We could not record your response. Please try again or contact support."
        ),
        500
      );
    }

    return html(submittedPage(action, false));
  } catch (err) {
    console.error("[reactivate] Unexpected error:", err);
    return html(
      errorPage("Something Went Wrong", "We could not record your response. Please try again or contact support."),
      500
    );
  }
}

async function getMagicLink(participantId: string): Promise<string> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const fallback = `${appUrl}/dashboard/participant/edit`;

  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participantId);
    const email = userData?.user?.email;
    if (!email) return fallback;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appUrl}/dashboard/participant/edit` },
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

function submittedPage(choice: "yes" | "no", repeatClick: boolean): string {
  const isYes = choice === "yes";
  const color = isYes ? "#16a34a" : "#dc2626";
  const bg = isYes ? "#f0fdf4" : "#fef2f2";
  const subtitle = isYes
    ? "Thanks for confirming. You&rsquo;ll continue to receive invitations to Texas Jury Study focus groups."
    : "Thanks for letting us know. You have been removed from active invitations.";
  const repeatNote = repeatClick
    ? `<p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">We already had your response on file &mdash; no changes were made.</p>`
    : "";

  return page("Response submitted", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:${bg};border:2px solid ${color};margin:0 auto 20px;font-size:32px;line-height:60px;color:${color};">✓</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:${color};">Successfully submitted your response</h1>
    <p style="margin:0;font-size:15px;color:#475569;line-height:1.6;">${subtitle}</p>
    ${repeatNote}
  `);
}

function missingProfilePage(missing: string[], dashboardUrl: string): string {
  const hasDl = missing.includes("dl");
  const hasPaypal = missing.includes("paypal");
  const items = [
    hasDl && "Driver&rsquo;s License number and photo",
    hasPaypal && "PayPal username",
  ].filter(Boolean).join(" and ");

  return page("Profile Incomplete", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#fff7ed;border:2px solid #f97316;margin:0 auto 20px;font-size:28px;line-height:60px;color:#c2410c;">⚠</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#c2410c;">Profile Incomplete</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#475569;line-height:1.6;">Before we can confirm your reactivation, please update your profile with the following missing information:</p>
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#c2410c;">${items}</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;line-height:1.6;">Once your profile is complete, click the <strong>Yes, I&rsquo;m still interested</strong> button in the email again to finish reactivating your account.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#2563eb;text-decoration:none;border-radius:6px;">Update Profile</a>
  `);
}

function errorPage(title: string, message: string): string {
  return page(title, `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#fef2f2;border:2px solid #dc2626;margin:0 auto 20px;font-size:28px;line-height:60px;color:#dc2626;">!</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#dc2626;">${title}</h1>
    <p style="margin:0 0 4px;font-size:15px;color:#475569;line-height:1.6;">${message}</p>
  `);
}
