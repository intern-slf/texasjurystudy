import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getInvoiceData } from "@/lib/invoiceData";
import { INVOICE_STATUS_LABEL, invoiceNumber, type InvoiceStatus } from "@/lib/invoice";
import { formatCents } from "@/lib/receipt-pricing";
import { formatDeadline } from "@/lib/slotBooking";
import { formatCentralDate } from "@/lib/timezone";
import { LEGAL_ENTITY, MAILING_ADDRESS, SUPPORT_EMAIL } from "@/lib/legal-constants";
import Logo from "@/components/Logo";
import PrintInvoiceButton from "@/components/PrintInvoiceButton";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS_PILL: Record<InvoiceStatus, string> = {
  paid: "bg-green-100 text-green-700",
  unpaid: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-700",
};

/** "texasjurystudy.com", from the app's own address, for the footer. */
const SITE_HOST = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

/** The title is what a saved PDF is named after. */
export async function generateMetadata({ params }: { params: Promise<{ caseId: string }> }): Promise<Metadata> {
  const { caseId } = await params;
  return { title: UUID_RE.test(caseId) ? `Invoice ${invoiceNumber(caseId)} – ${LEGAL_ENTITY}` : "Invoice" };
}

/**
 * A case's invoice, laid out after the one Heritage Plaza sends us: one page,
 * a navy band with our logo, who it's billed to, the receipt's rows and the
 * total. "Download PDF" prints it; the print styles in globals.css drop
 * everything but the sheet.
 *
 * Shared by the firm and admins. Reads with the service role, so it checks for
 * itself, by public.roles, that the caller is an admin or the firm whose case
 * it is.
 */
export default async function InvoicePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: roleRow } = await supabase.from("roles").select("role").eq("user_id", user.id).maybeSingle();
  const role = roleRow?.role;
  if (role !== "admin" && role !== "requestee") redirect("/dashboard");
  if (!UUID_RE.test(caseId)) notFound();

  const nowMs = Date.now();
  const data = await getInvoiceData(caseId, nowMs);
  // Another firm's case reads as no case at all.
  if (!data || (role !== "admin" && !data.ownerIds.includes(user.id))) notFound();
  const { invoice } = data;

  const backHref = role === "admin" ? `/dashboard/Admin/${caseId}` : `/dashboard/requestee/${caseId}`;
  const paid = invoice.status === "paid";

  return (
    <div className="mx-auto w-full max-w-[8.5in] space-y-4 print:max-w-none print:space-y-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to case
        </Link>
        <PrintInvoiceButton />
      </div>

      {/* The sheet keeps its own light colors, so the paper looks the same in dark mode. */}
      <article className="invoice-sheet flex min-h-[11in] flex-col bg-white text-slate-900 shadow-lg ring-1 ring-slate-200 print:min-h-[10.9in] print:shadow-none print:ring-0">
        {/* BAND */}
        <header className="flex flex-col gap-6 bg-brand-navy px-6 py-8 text-white sm:flex-row sm:items-start sm:justify-between sm:px-14 sm:py-10">
          <div className="space-y-3">
            <div className="inline-block rounded-md bg-white p-2">
              <Logo className="h-11 w-auto" />
            </div>
            {MAILING_ADDRESS && <p className="text-sm text-blue-200">{MAILING_ADDRESS}</p>}
          </div>
          <p className="text-3xl font-bold tracking-[0.12em] sm:pt-2 sm:text-4xl">INVOICE</p>
        </header>

        {/* BILLED TO + STATUS */}
        <section className="flex flex-col gap-6 px-6 pt-10 sm:flex-row sm:justify-between sm:px-14">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Billed to</p>
            <p className="mt-1 break-words text-lg font-bold">{invoice.billedTo.name}</p>
            {invoice.billedTo.email && invoice.billedTo.email !== invoice.billedTo.name && (
              <p className="break-all text-sm text-slate-600">{invoice.billedTo.email}</p>
            )}
          </div>
          <div className="space-y-1 text-sm text-slate-600 sm:text-right">
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${STATUS_PILL[invoice.status]}`}
            >
              {INVOICE_STATUS_LABEL[invoice.status]}
            </span>
            <p>
              Invoice # <span className="font-medium text-slate-800">{invoice.number}</span>
            </p>
            {invoice.issuedAt && <p>Issued {formatCentralDate(invoice.issuedAt)}</p>}
            {paid && invoice.paidAt && <p>Paid {formatCentralDate(invoice.paidAt)}</p>}
            {!paid && invoice.dueAt && <p>Due {formatDeadline(invoice.dueAt)}</p>}
          </div>
        </section>

        <div className="mx-6 mt-6 h-0.5 bg-brand-gold sm:mx-14" />

        {/* ROWS: the same as the firm's Receipt Value */}
        <section className="px-6 sm:px-14">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <th scope="col" className="py-3 font-bold">Description</th>
                <th scope="col" className="py-3 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.description} className="border-b border-slate-200">
                  <td className="py-4 pr-6">
                    <p className="font-semibold">{line.description}</p>
                    {line.details.map((d) => (
                      <p key={d} className="mt-0.5 text-sm text-slate-500">{d}</p>
                    ))}
                    {line.quantity && <p className="mt-2 text-sm text-slate-700">{line.quantity}</p>}
                  </td>
                  <td className="whitespace-nowrap py-4 text-right align-bottom font-semibold">
                    {formatCents(line.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl bg-blue-50 px-6 py-5 sm:px-7">
            <p className="font-bold text-blue-600">{paid ? "Total paid" : "Amount due"}</p>
            <p className="text-2xl font-bold text-blue-600 sm:text-3xl">{formatCents(invoice.totalCents)}</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="mx-6 mt-auto space-y-1 border-t border-slate-200 pb-10 pt-4 text-sm sm:mx-14">
          <p className="text-slate-700">
            {paid
              ? "This invoice has been paid in full — thank you."
              : invoice.status === "overdue" && invoice.dueAt
                ? `Payment was due ${formatDeadline(invoice.dueAt)}. Questions? Email ${SUPPORT_EMAIL}.`
                : invoice.dueAt
                  ? `Payment is due by ${formatDeadline(invoice.dueAt)}. Questions? Email ${SUPPORT_EMAIL}.`
                  : `Questions about this invoice? Email ${SUPPORT_EMAIL}.`}
          </p>
          <p className="text-xs text-slate-500">
            {[LEGAL_ENTITY, SUPPORT_EMAIL, SITE_HOST].filter(Boolean).map((part, i) => (
              <span key={part}>
                {i > 0 && <span className="mx-2" aria-hidden="true">·</span>}
                {part}
              </span>
            ))}
          </p>
        </footer>
      </article>
    </div>
  );
}
