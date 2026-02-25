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

export async function sendApprovalEmail(to: string, caseTitle: string) {
  const html = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2 style="color: #2563eb;">Your Case has been Approved!</h2>
      <p>The administrator has reviewed and approved your case: <strong>"${caseTitle}"</strong>.</p>
      <p>You can now view this case in your <strong>Approved Cases</strong> tab.</p>
      <div style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/presenter?tab=approved" 
           style="background-color: #2563eb; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none;">
          Go to Dashboard
        </a>
      </div>
    </div>
  `;

  await sendEmail({
    to,
    subject: `Case Approved: ${caseTitle}`,
    html,
  });
}