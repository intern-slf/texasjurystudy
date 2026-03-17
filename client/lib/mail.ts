import nodemailer from 'nodemailer';

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

  const html = `
    <html>
      <body style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
        <div style="border: 1px solid #eee; border-radius: 12px; max-width: 550px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #d97706; margin-top: 0; font-size: 24px;">Session Rescheduled</h2>
          <p style="font-size: 16px;">Your <strong>Texas Jury Study</strong> session has been rescheduled to a new date.</p>

          <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #d97706;">
            <p style="margin: 0; color: #92400e; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">New Session Date</p>
            <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 600; color: #78350f;">${newDateStr}</p>
          </div>

          <p style="font-size: 15px; color: #64748b;">Please note this updated date. No action is required — your ${role === "participant" ? "acceptance remains valid" : "session details have been updated"}.</p>

          <div style="margin-top: 25px; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}${dashboardPath}"
               style="background-color: #d97706; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 14px;">
              View Dashboard
            </a>
          </div>

          <p style="margin-top: 25px; font-size: 12px; color: #94a3b8; text-align: center;">If you did not expect this email, please ignore it.</p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `Session Rescheduled – New Date: ${newDateStr}`,
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
    .map(
      (t) =>
        `<li style="margin: 4px 0; font-size: 15px; color: #1e3a8a; font-weight: 600;">${t}</li>`
    )
    .join("");

  const html = `
    <html>
      <body style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
        <div style="border: 1px solid #eee; border-radius: 12px; max-width: 550px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #2563eb; margin-top: 0; font-size: 24px;">Your Session Has Been Created!</h2>
          <p style="font-size: 16px;">A session has been successfully created for your case${caseTitles.length > 1 ? "s" : ""}. Here are the details:</p>

          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="margin: 0 0 6px 0; color: #1e40af; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Case${caseTitles.length > 1 ? "s" : ""}</p>
            <ul style="margin: 0; padding-left: 18px;">${caseListHtml}</ul>
          </div>

          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em; width: 40%;">Session Date</td>
                <td style="padding: 6px 0; font-size: 15px; font-weight: 600;">${sessionDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Session Time</td>
                <td style="padding: 6px 0; font-size: 15px; font-weight: 600;">${timeStr}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Participants Invited</td>
                <td style="padding: 6px 0; font-size: 15px; font-weight: 600;">${participantCount}</td>
              </tr>
            </table>
          </div>

          <p style="font-size: 14px; color: #64748b;">You can view your session details on your dashboard.</p>

          <div style="margin-top: 25px; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter?tab=approved"
               style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 14px;">
              Go to Dashboard
            </a>
          </div>

          <p style="margin-top: 25px; font-size: 12px; color: #94a3b8; text-align: center;">If you did not expect this email, please ignore it.</p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `Session Created: ${caseTitles.join(", ")}`,
    html,
  });
}

export async function sendApprovalEmail(to: string, caseTitle: string) {
  const html = `
    <html>
      <body style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5;">
        <div style="border: 1px solid #eee; border-radius: 12px; max-width: 550px; padding: 30px; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #2563eb; margin-top: 0; font-size: 24px;">Your Case has been Approved!</h2>
          <p style="font-size: 16px;">The administrator has reviewed and approved your case:</p>

          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <p style="margin: 0; color: #1e40af; font-size: 14px; text-transform: uppercase; font-weight: bold; letter-spacing: 0.05em;">Case Title</p>
            <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 600; color: #1e3a8a;">${caseTitle}</p>
          </div>

          <p style="font-size: 15px; color: #64748b;">You can now view this case in your <strong>Approved Cases</strong> tab on your dashboard.</p>

          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
            <p style="margin: 0; font-size: 14px; color: #15803d;">
              We will send you another email once a session has been created for your case. Please stay tuned!
            </p>
          </div>

          <div style="margin-top: 25px; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter?tab=approved"
               style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; font-size: 14px;">
              Go to Dashboard
            </a>
          </div>

          <p style="margin-top: 25px; font-size: 12px; color: #94a3b8; text-align: center;">If you did not expect this email, please ignore it.</p>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to,
    subject: `Case Approved: ${caseTitle}`,
    html,
  });
}