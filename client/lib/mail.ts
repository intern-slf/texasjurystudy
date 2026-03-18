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

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:6px;margin:0 0 16px;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">Session Date</p>
        <p style="margin:0;font-size:15px;font-weight:600;color:#15803d;">${sessionDate}</p>
      </td>
    </tr>
  </table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-left:4px solid #64748b;border-radius:6px;margin:0 0 28px;">
    <tr>
      <td style="padding:16px 20px;">
        <p style="margin:0;font-size:15px;color:#334155;">
          Your <strong>transcripts and video of the session will be sent to you within a week.</strong>
        </p>
      </td>
    </tr>
  </table>

  <p style="margin:0;font-size:14px;color:#64748b;">
    If you have any questions, please don't hesitate to reach out to us.
  </p>
`);
  await sendEmail({
    to,
    subject: `Session Completed: ${caseTitles.join(", ")} | Texas Jury Study`,
    html,
  });
}