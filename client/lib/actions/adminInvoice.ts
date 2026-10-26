"use server";

import { requireAdmin } from "@/lib/requireAdmin";
import { syncInvoice } from "@/lib/invoiceData";
import { sendInvoiceEmail } from "@/lib/invoiceEmail";
import { renderInvoicePdf } from "@/lib/invoicePdf";

// An admin action, so it starts with requireAdmin(): as a server action it can
// be called by anyone signed in, with any arguments.

type Result = { ok: true; sentTo: string; warning?: string } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (error: string): Result => ({ ok: false, error });

/**
 * Emails the case's invoice to the firm it's billed to, with the PDF attached.
 * Brings the invoice up to date first, as the invoice page does, so the email
 * says what the page says.
 */
export async function emailInvoice(caseId: string): Promise<Result> {
  await requireAdmin();
  if (typeof caseId !== "string" || !UUID_RE.test(caseId)) return fail("That case doesn't exist.");

  let data;
  try {
    data = await syncInvoice(caseId);
  } catch (err) {
    console.error("[emailInvoice] couldn't read the invoice:", err);
    return fail("Couldn't read the invoice. Refresh the page and try again.");
  }
  if (!data) return fail("That case doesn't exist.");

  const { invoice } = data;
  if (!invoice) return fail("This case has no invoice yet. It's issued once the case is approved or a time is booked.");
  if (invoice.status === "void") return fail("This invoice is void, so there's nothing to send.");
  const to = invoice.billedTo.email;
  if (!to) return fail("The firm has no email address on file. Download the PDF and send it directly.");

  let pdf: Uint8Array;
  try {
    pdf = await renderInvoicePdf(invoice);
  } catch (err) {
    console.error("[emailInvoice] couldn't make the PDF:", err);
    return fail("Couldn't make the invoice PDF, so nothing was sent.");
  }

  let attached: boolean;
  try {
    ({ attached } = await sendInvoiceEmail({ to, caseId, invoice, pdf }));
  } catch (err) {
    console.error("[emailInvoice] email failed:", err);
    return fail(`The email to ${to} failed. Try again in a minute.`);
  }
  // The mailer only says how many files it attached once it's redeployed with attachments.
  if (!attached) {
    console.error("[emailInvoice] the mailer sent the email without the PDF; redeploy /mailer.");
    return {
      ok: true,
      sentTo: to,
      warning: `Sent to ${to}, but without the PDF: the mail service needs updating. Download the PDF and send it directly.`,
    };
  }
  return { ok: true, sentTo: to };
}
