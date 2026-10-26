import { emailWrapper, escHtml, sendEmail } from "@/lib/mail";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { INVOICE_STATUS_LABEL, invoiceCheckPayable, type InvoiceView } from "@/lib/invoice";
import { formatCents } from "@/lib/receipt-pricing";
import { formatDeadline } from "@/lib/slotBooking";
import { formatCentralDate } from "@/lib/timezone";
import { invoicePdfFileName } from "@/lib/invoicePdf";

/**
 * The invoice, emailed to the firm by an admin (lib/actions/adminInvoice.ts),
 * with the PDF attached (lib/invoicePdf.ts). The email also carries the
 * invoice itself, the same rows and total as app/invoice/[caseId], and links
 * to that page. Every value a firm typed is escaped.
 */

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

const LABEL = "margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;";

export function invoiceEmailSubject(invoice: Pick<InvoiceView, "number" | "caseTitle">): string {
  return `Invoice ${invoice.number}: ${invoice.caseTitle} | Texas Jury Study`;
}

export function invoiceEmailHtml(caseId: string, invoice: InvoiceView): string {
  const paid = invoice.status === "paid";
  const overdue = invoice.status === "overdue";

  const facts: Array<[label: string, value: string]> = [
    ["Invoice #", invoice.number],
    ["Issued", formatCentralDate(invoice.issuedAt) ?? "—"],
    ["Status", INVOICE_STATUS_LABEL[invoice.status]],
  ];
  if (paid && invoice.paidAt) facts.push(["Paid", formatCentralDate(invoice.paidAt) ?? "—"]);
  if (!paid && invoice.dueAt) facts.push([overdue ? "Was due" : "Due", formatDeadline(invoice.dueAt)]);

  const rows = invoice.lines
    .map(
      (line) => `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${escHtml(line.description)}</p>
            ${line.details.map((d) => `<p style="margin:2px 0 0;font-size:13px;color:#64748b;">${escHtml(d)}</p>`).join("")}
            ${line.quantity ? `<p style="margin:6px 0 0;font-size:13px;color:#334155;">${escHtml(line.quantity)}</p>` : ""}
          </td>
          <td style="padding:14px 0 14px 16px;border-bottom:1px solid #e2e8f0;vertical-align:bottom;text-align:right;white-space:nowrap;font-size:15px;font-weight:600;color:#1e293b;">
            ${formatCents(line.amountCents)}
          </td>
        </tr>`
    )
    .join("");

  const closing = paid
    ? "This invoice has been paid in full, thank you. We're sending it for your records."
    : overdue && invoice.dueAt
      ? `Payment was due ${escHtml(formatDeadline(invoice.dueAt))}. Please pay it as soon as you can.`
      : invoice.dueAt
        ? `Please pay it by <strong>${escHtml(formatDeadline(invoice.dueAt))}</strong>.`
        : "";

  const checks = invoiceCheckPayable(invoice.status);
  const checksBlock = checks
    ? `
    <div style="margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:14px;color:#475569;">Please make checks payable to:</p>
      <p style="margin:0;font-size:15px;font-weight:700;color:#1e3a8a;">${escHtml(checks.payee)}</p>
      ${checks.addressLines.map((l) => `<p style="margin:0;font-size:14px;color:#334155;">${escHtml(l)}</p>`).join("")}
    </div>`
    : "";

  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Your Invoice from Texas Jury Study</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Here is the invoice for your focus group, <strong>${escHtml(invoice.caseTitle)}</strong>, billed to ${escHtml(invoice.billedTo.name)}. A PDF copy is attached.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
      <tr>
        ${facts
          .map(
            ([label, value]) => `
        <td style="padding:12px 16px;vertical-align:top;">
          <p style="${LABEL}">${escHtml(label)}</p>
          <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${escHtml(value)}</p>
        </td>`
          )
          .join("")}
      </tr>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr>
        <td style="padding:0 0 8px;border-bottom:2px solid #ad8a37;"><p style="${LABEL}">Description</p></td>
        <td style="padding:0 0 8px;border-bottom:2px solid #ad8a37;text-align:right;"><p style="${LABEL}">Amount</p></td>
      </tr>
      ${rows}
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border-radius:6px;margin:0 0 24px;">
      <tr>
        <td style="padding:16px 20px;font-size:15px;font-weight:700;color:#2563eb;">${paid ? "Total paid" : "Amount due"}</td>
        <td style="padding:16px 20px;text-align:right;font-size:22px;font-weight:700;color:#2563eb;">${formatCents(invoice.totalCents)}</td>
      </tr>
    </table>
${checksBlock}

    <p style="margin:0 0 24px;font-size:14px;color:#475569;">
      ${closing}${closing ? " " : ""}Questions? Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1e3a8a;">${SUPPORT_EMAIL}</a>.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${appUrl()}/invoice/${encodeURIComponent(caseId)}"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            View Invoice Online
          </a>
        </td>
      </tr>
    </table>
  `);
}

/** Sends it with `pdf` attached. Returns whether the mailer attached it (an older one sends without). */
export async function sendInvoiceEmail(args: {
  to: string;
  caseId: string;
  invoice: InvoiceView;
  pdf: Uint8Array;
}): Promise<{ attached: boolean }> {
  const result = await sendEmail({
    to: args.to,
    subject: invoiceEmailSubject(args.invoice),
    html: invoiceEmailHtml(args.caseId, args.invoice),
    attachments: [
      {
        filename: invoicePdfFileName(args.invoice),
        contentType: "application/pdf",
        contentBase64: Buffer.from(args.pdf).toString("base64"),
      },
    ],
  });
  return { attached: result.attachments === 1 };
}
