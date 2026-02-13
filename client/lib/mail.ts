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