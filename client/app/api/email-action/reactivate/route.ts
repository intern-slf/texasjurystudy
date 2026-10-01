import { NextRequest, NextResponse } from "next/server";
import { verifyReactivationToken, type ReactivationAction } from "@/lib/reactivationToken";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");

  if (!token) {
    return html(errorPage("Missing Token", "No action token was provided in this link."));
  }

  const verified = verify(token);
  if (verified instanceof NextResponse) return verified;
  const { participantId, action } = verified;

  // The Unsubscribe link only shows the button; pressing it (POST) is what
  // unsubscribes. Email scanners open every link in a message, and a click
  // alone would let one take an active member off the panel.
  if (action === "unsubscribe") {
    return html(unsubscribeConfirmPage(token));
  }

  // "edit" action just bounces the user into the profile editor via a freshly
  // minted Supabase magic link. The HMAC token can live for 30 days, but the
  // Supabase magic link is short-lived — generating it on click avoids expiry.
  if (action === "edit") {
    const magicLink = await getMagicLink(participantId);
    return NextResponse.redirect(magicLink, { status: 302 });
  }

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
      errorPage(
        "Something Went Wrong",
        `We could not record your response. Please try again, or email ${SUPPORT_EMAIL}.`
      ),
      500
    );
  }
}

// The Unsubscribe button. Sets reactivation_status to "no" whatever it was
// before, which is the same as answering No: sendReactivationEmails skips
// "no", and only "yes" gets invited. A repeat keeps the first timestamp.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return html(invalidRequestPage(), 400);
  }

  const token = form.get("token");
  if (typeof token !== "string" || !token) {
    return html(errorPage("Missing Token", "No action token was provided with this request."), 400);
  }

  const verified = verify(token);
  if (verified instanceof NextResponse) return verified;
  const { participantId, action } = verified;

  if (action !== "unsubscribe") return html(invalidRequestPage(), 400);

  const { error } = await supabaseAdmin
    .from("jury_participants")
    .update({
      reactivation_status: "no",
      reactivation_confirmed_at: new Date().toISOString(),
    })
    .eq("user_id", participantId)
    .neq("reactivation_status", "no");

  if (error) {
    console.error("[reactivate] Failed to unsubscribe participant:", error);
    return html(
      errorPage(
        "Something Went Wrong",
        `We could not unsubscribe you. Please try again, or email ${SUPPORT_EMAIL} and we will do it for you.`
      ),
      500
    );
  }

  return html(unsubscribedPage());
}

function verify(token: string): { participantId: string; action: ReactivationAction } | NextResponse {
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
        `This link has expired or is not valid. To rejoin the panel, or to stop receiving these emails, email us at ${SUPPORT_EMAIL}.`
      ),
      400
    );
  }
  return payload;
}

async function getMagicLink(participantId: string): Promise<string> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const next = "/dashboard/participant/edit";
  const fallback = `${appUrl}${next}`;

  try {
    const { data: userData } = await supabaseAdmin.auth.admin.getUserById(participantId);
    const email = userData?.user?.email;
    if (!email) return fallback;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${appUrl}${next}` },
    });

    // Route through our PKCE /auth/confirm handler — the raw action_link uses
    // Supabase's implicit (hash-fragment) flow which our /auth/login page
    // doesn't consume, leaving the user stuck on the login screen.
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) return fallback;

    const params = new URLSearchParams({
      token_hash: hashedToken,
      type: "magiclink",
      next,
    });
    return `${appUrl}/auth/confirm?${params.toString()}`;
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
<body style="margin:0;padding:0;background-color:#F7F4EE;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background-color:#012A68;border-radius:8px 8px 0 0;padding:28px 36px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Texas Jury Study</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:40px 36px;border-left:1px solid #DAD5C8;border-right:1px solid #DAD5C8;text-align:center;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#F7F4EE;border:1px solid #DAD5C8;border-top:none;border-radius:0 0 8px 8px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#6B6960;">© ${year} Texas Jury Study. All rights reserved.</p>
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
  const color = isYes ? "#2D6A3E" : "#C32130";
  const bg = isYes ? "#E3EFE6" : "#F9E9EA";
  const subtitle = isYes
    ? "Thanks for confirming. You&rsquo;ll continue to receive invitations to Texas Jury Study focus groups."
    : "Thanks for letting us know. You have been removed from active invitations, and you will not receive these emails again.";
  const repeatNote = repeatClick
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6B6960;">We already had your response on file &mdash; no changes were made.</p>`
    : "";

  return page("Response submitted", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:${bg};border:2px solid ${color};margin:0 auto 20px;font-size:32px;line-height:60px;color:${color};">✓</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:${color};">Successfully submitted your response</h1>
    <p style="margin:0;font-size:15px;color:#3F3E38;line-height:1.6;">${subtitle}</p>
    ${repeatNote}
  `);
}

function unsubscribeConfirmPage(token: string): string {
  return page("Unsubscribe", `
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#012A68;">Unsubscribe from these emails?</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#3F3E38;line-height:1.6;">You will stop receiving these emails, and we will no longer invite you to Texas Jury Study focus groups. Sessions you have already accepted are not cancelled.</p>
    <form method="post" action="/api/email-action/reactivate" style="margin:0;">
      <input type="hidden" name="token" value="${escAttr(token)}"/>
      <button type="submit" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#C32130;border:none;border-radius:6px;cursor:pointer;">Unsubscribe</button>
    </form>
  `);
}

function unsubscribedPage(): string {
  return page("Unsubscribed", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#E3EFE6;border:2px solid #2D6A3E;margin:0 auto 20px;font-size:32px;line-height:60px;color:#2D6A3E;">✓</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#2D6A3E;">You have been unsubscribed</h1>
    <p style="margin:0;font-size:15px;color:#3F3E38;line-height:1.6;">You will not receive these emails again, and we will no longer invite you to focus groups. Sessions you have already accepted are not cancelled; if you can&rsquo;t attend one, email ${SUPPORT_EMAIL}.</p>
  `);
}

function invalidRequestPage(): string {
  return errorPage(
    "Invalid Request",
    "This link can&rsquo;t be used for that. Please use the buttons in the email."
  );
}

function escAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function missingProfilePage(missing: string[], dashboardUrl: string): string {
  const hasDl = missing.includes("dl");
  const hasPaypal = missing.includes("paypal");
  const items = [
    hasDl && "Texas State ID number and photo",
    hasPaypal && "PayPal username",
  ].filter(Boolean).join(" and ");

  return page("Profile Incomplete", `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#FBF0DD;border:2px solid #AD8A37;margin:0 auto 20px;font-size:28px;line-height:60px;color:#6E5418;">⚠</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#6E5418;">Profile Incomplete</h1>
    <p style="margin:0 0 8px;font-size:15px;color:#3F3E38;line-height:1.6;">Before we can confirm your reactivation, please update your profile with the following missing information:</p>
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#6E5418;">${items}</p>
    <p style="margin:0 0 24px;padding:12px 16px;background-color:#FBF0DD;border-radius:6px;font-size:13px;color:#54524A;line-height:1.6;">Once your profile is complete, click the <strong>Yes, I&rsquo;m still interested</strong> button in the email again to finish reactivating your account.</p>
    <a href="${dashboardUrl}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;background-color:#012A68;text-decoration:none;border-radius:6px;">Update Profile</a>
  `);
}

function errorPage(title: string, message: string): string {
  return page(title, `
    <div style="width:64px;height:64px;border-radius:50%;background-color:#F9E9EA;border:2px solid #C32130;margin:0 auto 20px;font-size:28px;line-height:60px;color:#C32130;">!</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#C32130;">${title}</h1>
    <p style="margin:0 0 4px;font-size:15px;color:#3F3E38;line-height:1.6;">${message}</p>
  `);
}
