import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Shared email wrapper – provides consistent branded header and footer
// ---------------------------------------------------------------------------
export function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0" border="0">

          <!-- Header -->
          <tr>
            <td style="background-color:#1e3a8a;border-radius:8px 8px 0 0;padding:28px 36px;text-align:center;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Texas Jury Study</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:36px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;color:#1e293b;line-height:1.7;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:20px 36px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#cbd5e1;">© ${new Date().getFullYear()} Texas Jury Study. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false, // accept self-signed certificates
  },
});

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("SMTP configuration is missing in .env.local. Skipping email.");
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Texas Jury Study" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      html, // html body
    });

    console.log("Email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email via Nodemailer:", error);
    throw error;
  }
}

export async function sendRescheduleEmail(
  to: string,
  newDateStr: string,
  role: "participant" | "presenter"
) {
  const dashboardPath =
    role === "presenter" ? "/dashboard/presenter" : "/dashboard/participant";

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#d97706;">Session Rescheduled</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Your Texas Jury Study session has been moved to a new date. Please review the updated information below.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-left:4px solid #d97706;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;">New Session Date</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#78350f;">${newDateStr}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">
      No action is required — your ${role === "participant" ? "acceptance remains valid" : "session details have been updated automatically"}.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#d97706;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Session Rescheduled – New Date: ${newDateStr} | Texas Jury Study`,
    html,
  });
}

export async function sendSessionCreatedEmail(
  to: string,
  caseTitles: string[],
  sessionDate: string,
  timeStr: string,
  participantCount: number
) {
  const caseListHtml = caseTitles
    .map((t) => `<li style="margin:4px 0;font-size:15px;font-weight:600;color:#1e3a8a;">${t}</li>`)
    .join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Session Scheduled</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      A study session has been created for your case${caseTitles.length > 1 ? "s" : ""}. Please review the details below.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Case${caseTitles.length > 1 ? "s" : ""}</p>
          <ul style="margin:0;padding-left:18px;">${caseListHtml}</ul>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${sessionDate}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #e2e8f0;">
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Session Time</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${timeStr}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 20px;">
          <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">Participants Invited</p>
          <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${participantCount}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter?tab=approved"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View Session Details
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Session Scheduled: ${caseTitles.join(", ")} | Texas Jury Study`,
    html,
  });
}

export async function sendSessionCompletedEmail(
  to: string,
  caseTitles: string[],
  sessionDate: string,
) {
  const caseListHtml = caseTitles
    .map((t) => `<li style="margin:4px 0;font-size:15px;font-weight:600;color:#1e3a8a;">${t}</li>`)
    .join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#15803d;">Session Completed</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Thank you for being a part of the Texas Jury Study. Your session has been successfully completed.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Case${caseTitles.length > 1 ? "s" : ""}</p>
          <ul style="margin:0;padding-left:18px;">${caseListHtml}</ul>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#15803d;">${sessionDate}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;color:#475569;">
            Your <strong>transcripts and video of the session</strong> can be requested from your <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter" style="color:#2563eb;text-decoration:underline;">Presenter Dashboard</a>. You'll be notified when they're ready for download.
          </p>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Session Completed: ${caseTitles.join(", ")} | Texas Jury Study`,
    html,
  });
}

export async function sendProfileUpdatedEmail(
  to: string,
  firstName: string,
  changedFields: string[]
) {
  const fieldListHtml = changedFields
    .map((f) => `<li style="margin:4px 0;font-size:14px;color:#1e293b;">${f}</li>`)
    .join("");

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Profile Updated</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Hi ${firstName}, an administrator has updated your participant profile.
    </p>

    ${changedFields.length > 0 ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Fields Updated</p>
          <ul style="margin:0;padding-left:18px;">${fieldListHtml}</ul>
        </td>
      </tr>
    </table>
    ` : ""}

    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">
      If you believe any of these changes are incorrect, please contact us.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Profile
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: "Your Profile Has Been Updated | Texas Jury Study",
    html,
  });
}

export async function sendPresenceConfirmedEmail(
  to: string,
  firstName: string,
  sessionDate: string,
  timeStr: string,
) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#15803d;">Presence Confirmed</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Hi ${firstName}, we have confirmed your presence for the upcoming Texas Jury Study session. Please review the details below.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#15803d;">${sessionDate}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Session Time</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${timeStr}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">
      We look forward to seeing you. If you have any questions, please feel free to contact us.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Your Presence Has Been Confirmed – ${sessionDate} | Texas Jury Study`,
    html,
  });
}

export async function sendPresenceDeclinedEmail(
  to: string,
  firstName: string,
  sessionDate: string,
) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#dc2626;">Session Invitation Declined</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Hi ${firstName}, we wanted to let you know that your attendance for the upcoming Texas Jury Study session has been marked as declined on your behalf.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#dc2626;">${sessionDate}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">
      If you believe this was a mistake or have any questions, please contact us as soon as possible.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Session Invitation Declined – ${sessionDate} | Texas Jury Study`,
    html,
  });
}

export async function sendApprovalEmail(to: string, caseTitle: string) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#15803d;">Case Approved</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      We are pleased to inform you that your case has been reviewed and approved by the program administrator.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 20px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Approved Case</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#1e3a8a;">${caseTitle}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;color:#15803d;">
            You will receive a follow-up notification once a study session has been scheduled for this case.
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter?tab=approved"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View Approved Cases
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Case Approved: ${caseTitle} | Texas Jury Study`,
    html,
  });
}

export async function sendInviteAcceptedConfirmationEmail(
  to: string,
  sessionDate: string,
  timeStr: string,
) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#15803d;">Thank You for Accepting!</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Thank you for accepting your invitation to the Texas Jury Study. We're excited to have you join us!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Scheduled Date</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#15803d;">${sessionDate}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Scheduled Time</p>
          <p style="margin:0;font-size:16px;font-weight:600;color:#1e293b;">${timeStr}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;color:#1e40af;">
            We will send you the <strong>meeting link</strong> for your session soon. Please keep an eye on your inbox closer to the date.
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Thank You for Accepting – ${sessionDate} | Texas Jury Study`,
    html,
  });
}

export async function sendInviteDeclinedConfirmationEmail(to: string) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#475569;">Thank You for Responding</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      We have recorded your response. We completely understand and appreciate you letting us know.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #94a3b8;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;font-size:14px;color:#475569;">
            We hope to see you at a future session. We will send you an invitation when another opportunity becomes available that matches your profile.
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: "Thank You for Responding | Texas Jury Study",
    html,
  });
}

export async function sendRejectionEmail(to: string, caseTitle: string, reason: string) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#dc2626;">Case Rejected</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      We regret to inform you that your case has been reviewed and was not approved by the program administrator.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;margin:0 0 16px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.08em;">Case</p>
          <p style="margin:0;font-size:18px;font-weight:700;color:#991b1b;">${caseTitle}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:4px solid #f87171;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.08em;">Reason for Rejection</p>
          <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${reason}</p>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 28px;font-size:14px;color:#64748b;">
      If you have any questions or would like to discuss this further, please feel free to contact us.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Case Rejected: ${caseTitle} | Texas Jury Study`,
    html,
  });
}

export async function sendSessionFullEmail(
  to: string,
  firstName: string,
  sessionDate: string,
) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Session Update</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Hi ${firstName}, thank you for your interest in the Texas Jury Study. We wanted to let you know that the session scheduled for <strong>${sessionDate}</strong> has reached its participant capacity and is now full.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:20px;font-weight:700;color:#1e3a8a;">${sessionDate}</p>
        </td>
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:14px 20px;">
          <p style="margin:0;font-size:14px;color:#15803d;">
            Please don't worry — you will be considered for the next available session that matches your profile. We appreciate your willingness to participate and will reach out again soon.
          </p>
        </td>
      </tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/participant"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View My Dashboard
          </a>
        </td>
      </tr>
    </table>
  `);

  await sendEmail({
    to,
    subject: `Session Full – You'll Be Considered for the Next Session | Texas Jury Study`,
    html,
  });
}

export async function sendZoomLinkEmail(
  to: string,
  firstName: string,
  sessionDate: string,
  zoomLink: string,
  timeStr?: string,
) {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Your Zoom Link is Ready</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Hi ${firstName}, your session is coming up. Use the link below to join the Texas Jury Study session on <strong>${sessionDate}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #bfdbfe;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#1e3a8a;">${sessionDate}</p>
        </td>
      </tr>
      ${timeStr ? `
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Session Time</p>
          <p style="margin:0;font-size:16px;font-weight:700;color:#1e3a8a;">${timeStr}</p>
        </td>
      </tr>` : ''}
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${zoomLink}"
             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">
            Join Zoom Meeting
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;color:#64748b;">
      Or copy this link into your browser:<br/>
      <span style="color:#2563eb;word-break:break-all;">${zoomLink}</span>
    </p>
  `);

  await sendEmail({
    to,
    subject: `Zoom Link for Your Session on ${sessionDate} | Texas Jury Study`,
    html,
  });
}

export interface PresenterParticipantInfo {
  first_name: string;
  last_name: string;
  email: string;
  city?: string;
  county?: string;
  state?: string;
  gender?: string;
  race?: string;
  age?: number | null;
  marital_status?: string;
  political_affiliation?: string;
  education_level?: string;
  currently_employed?: string;
  family_income?: string;
  served_on_jury?: string;
  has_children?: string;
}

export async function sendPresenterInfoEmail(
  to: string,
  sessionDate: string,
  zoomLink: string | null,
  driveLinks: { caseTitle: string; urls: string[] }[],
  participants: PresenterParticipantInfo[],
) {
  // Zoom section
  const zoomHtml = zoomLink
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-left:4px solid #2563eb;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Zoom Meeting Link</p>
          <a href="${zoomLink}" style="margin:0;font-size:15px;font-weight:600;color:#2563eb;word-break:break-all;">${zoomLink}</a>
        </td>
      </tr>
    </table>`
    : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef9c3;border-left:4px solid #ca8a04;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;font-size:14px;color:#854d0e;">Zoom link has not been set for this session yet.</p>
        </td>
      </tr>
    </table>`;

  // Drive links section
  let driveHtml = "";
  const allDriveLinks = driveLinks.filter((d) => d.urls.length > 0);
  if (allDriveLinks.length > 0) {
    const linksListHtml = allDriveLinks
      .map((d) => {
        const urlItems = d.urls
          .map((u) => `<li style="margin:4px 0;"><a href="${u}" style="font-size:14px;color:#2563eb;word-break:break-all;">${u}</a></li>`)
          .join("");
        return `<p style="margin:8px 0 4px;font-size:13px;font-weight:700;color:#1e293b;">${d.caseTitle}</p><ul style="margin:0;padding-left:18px;">${urlItems}</ul>`;
      })
      .join("");

    driveHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Google Drive Links</p>
          ${linksListHtml}
        </td>
      </tr>
    </table>`;
  }

  // Participants table
  let participantsHtml = "";
  if (participants.length > 0) {
    const rows = participants
      .map(
        (p, i) => `
      <tr style="background-color:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
        <td style="padding:8px 12px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${p.first_name} ${p.last_name}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.email}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.age ?? "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.gender || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.race || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.city || "N/A"}, ${p.county || ""}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.political_affiliation || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.education_level || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.marital_status || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.currently_employed || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.family_income || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.served_on_jury || "N/A"}</td>
        <td style="padding:8px 12px;font-size:13px;color:#475569;border-bottom:1px solid #e2e8f0;">${p.has_children || "N/A"}</td>
      </tr>`
      )
      .join("");

    participantsHtml = `
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:0.08em;">Accepted Participants (${participants.length})</p>
    <div style="overflow-x:auto;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:collapse;margin:0 0 24px;">
        <tr style="background-color:#1e3a8a;">
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Name</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Email</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Age</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Gender</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Race</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Location</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Political</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Education</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Marital</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Employed</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Income</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Jury</th>
          <th style="padding:10px 12px;font-size:11px;font-weight:700;color:#ffffff;text-align:left;text-transform:uppercase;letter-spacing:0.05em;">Children</th>
        </tr>
        ${rows}
      </table>
    </div>`;
  } else {
    participantsHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef9c3;border-left:4px solid #ca8a04;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;font-size:14px;color:#854d0e;">No participants have accepted this session yet.</p>
        </td>
      </tr>
    </table>`;
  }

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Session Information for Presenter</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      You have been notified about the Texas Jury Study session on <strong>${sessionDate}</strong>. Below you will find all the details you need.
    </p>

    ${zoomHtml}
    ${driveHtml}
    ${participantsHtml}
  `);

  await sendEmail({
    to,
    subject: `Session Details: ${sessionDate} | Texas Jury Study`,
    html,
  });
}

