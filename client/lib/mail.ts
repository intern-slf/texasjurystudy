import { Resend } from 'resend';

// Initialize as null first to prevent the constructor from crashing the app
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendApprovalEmail(to: string, caseTitle: string) {
  // Check if resend was initialized correctly
  if (!resend) {
    console.error("RESEND_API_KEY is missing or invalid in .env.local. Skipping email.");
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: 'Texas Jury Study <onboarding@resend.dev>', 
      to: [to],
      subject: `Case Approved: ${caseTitle}`,
      html: `
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
      `,
    });

    if (error) {
      console.error("Resend Error Details:", error);
    } else {
      console.log("Email sent successfully:", data?.id);
    }
  } catch (error) {
    console.error("Failed to send approval email:", error);
  }
}