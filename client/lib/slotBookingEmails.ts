import { emailWrapper, escHtml, sendEmail } from "@/lib/mail";
import { SUPPORT_EMAIL } from "@/lib/legal-constants";
import { SLOT_TIME_ZONE_LABEL, formatDateKey, formatSlotRange, slotDateKey, type TimeSlot } from "@/lib/requesteeTimeSlots";
import { formatDeadline } from "@/lib/slotBooking";

/**
 * Emails about a firm's booked time slot: to the firm, and a notice to the team
 * at info@. Every value a firm typed (the case title above all) is escaped.
 */

type Slot = Pick<TimeSlot, "starts_at" | "ends_at">;

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** "Tuesday, October 20, 2026, 10:00 AM – 12:00 PM CT". */
export function describeSlotLong(slot: Slot): string {
  const date = formatDateKey(slotDateKey(slot.starts_at), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${date}, ${formatSlotRange(slot)} ${SLOT_TIME_ZONE_LABEL}`;
}

function detailTable(rows: Array<[label: string, value: string]>): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
      ${rows
        .map(
          ([label, value], i) => `
        <tr>
          <td style="padding:12px 20px;${i < rows.length - 1 ? "border-bottom:1px solid #e2e8f0;" : ""}">
            <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">${escHtml(label)}</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#1e293b;">${escHtml(value)}</p>
          </td>
        </tr>`
        )
        .join("")}
    </table>`;
}

function notice(text: string, tone: "info" | "warn" = "info"): string {
  const [bg, border, color] = tone === "warn" ? ["#fffbeb", "#d97706", "#92400e"] : ["#eff6ff", "#2563eb", "#1e3a8a"];
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bg};border-left:4px solid ${border};border-radius:6px;margin:0 0 24px;">
      <tr><td style="padding:14px 20px;"><p style="margin:0;font-size:14px;color:${color};">${text}</p></td></tr>
    </table>`;
}

function caseButton(caseId: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:6px;background-color:#2563eb;">
          <a href="${appUrl()}/dashboard/requestee/${encodeURIComponent(caseId)}"
             style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${escHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

/**
 * To the firm: its time is held, and payment is due by the deadline. `paid` when
 * the case was already paid for (an admin re-booking it), so it isn't asked again.
 */
export async function sendSlotHeldEmail(args: {
  to: string;
  caseId: string;
  caseTitle: string;
  slot: Slot;
  dueAt: Date;
  paid?: boolean;
}): Promise<void> {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Your Focus Group Time Is Held</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      We are holding this time for your online focus group.
    </p>
    ${detailTable([
      ["Case", args.caseTitle],
      ["Time", describeSlotLong(args.slot)],
      ["Payment", args.paid ? "Received, thank you" : `Due ${formatDeadline(args.dueAt)}`],
    ])}
    ${
      args.paid
        ? ""
        : notice(
            `An invoice will follow from our team. Please pay it by <strong>${escHtml(formatDeadline(args.dueAt))}</strong> to keep this time; if payment hasn't reached us by then, we may release it to another firm.`,
            "warn"
          )
    }
    ${notice(
      `You can change or cancel this time from your case page until we approve the case. After that, email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1e3a8a;">${SUPPORT_EMAIL}</a> to change it.`
    )}
    ${caseButton(args.caseId, "View Your Case")}
  `);

  await sendEmail({ to: args.to, subject: `Time held: ${args.caseTitle} | Texas Jury Study`, html });
}

/** To the firm: an admin moved its booking to another time. */
export async function sendSlotMovedEmail(args: {
  to: string;
  caseId: string;
  caseTitle: string;
  from: Slot;
  toSlot: Slot;
}): Promise<void> {
  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Your Focus Group Time Has Changed</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">
      Our team has moved the time held for your online focus group.
    </p>
    ${detailTable([
      ["Case", args.caseTitle],
      ["New time", describeSlotLong(args.toSlot)],
      ["Previous time", describeSlotLong(args.from)],
    ])}
    ${notice(
      `If the new time doesn't work for you, email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1e3a8a;">${SUPPORT_EMAIL}</a>.`
    )}
    ${caseButton(args.caseId, "View Your Case")}
  `);

  await sendEmail({ to: args.to, subject: `Your focus group time has changed: ${args.caseTitle} | Texas Jury Study`, html });
}

/**
 * To the firm: its held time was released. "unpaid" when payment didn't arrive
 * by the deadline, in which case the firm can pick another time if its case is
 * still under review.
 */
export async function sendSlotReleasedEmail(args: {
  to: string;
  caseId: string;
  caseTitle: string;
  slot: Slot;
  reason: "unpaid" | "other";
  canRebook: boolean;
}): Promise<void> {
  const why =
    args.reason === "unpaid"
      ? "We released this time because we hadn't received payment by the deadline."
      : "Our team has released this time.";
  const next = args.canRebook
    ? "Your case is still open: you can pick another available time on your case page."
    : `Email us at <a href="mailto:${SUPPORT_EMAIL}" style="color:#1e3a8a;">${SUPPORT_EMAIL}</a> to arrange another time.`;

  const html = emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#b45309;">Your Held Time Was Released</h2>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;">${why}</p>
    ${detailTable([
      ["Case", args.caseTitle],
      ["Released time", describeSlotLong(args.slot)],
    ])}
    ${notice(next)}
    ${caseButton(args.caseId, "View Your Case")}
  `);

  await sendEmail({ to: args.to, subject: `Your held time was released: ${args.caseTitle} | Texas Jury Study`, html });
}

/** To the team at info@: a firm's booking was made, changed or released. */
export async function sendSlotTeamNotice(args: {
  subject: string;
  heading: string;
  rows: Array<[label: string, value: string]>;
  caseId: string;
}): Promise<void> {
  const html = emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1e3a8a;">${escHtml(args.heading)}</h2>
    ${detailTable(args.rows)}
    <p style="margin:0;font-size:14px;">
      <a href="${appUrl()}/dashboard/Admin/${encodeURIComponent(args.caseId)}" style="color:#2563eb;">Open the case</a>
      &nbsp;·&nbsp;
      <a href="${appUrl()}/dashboard/Admin/requestees/time-slots" style="color:#2563eb;">Open the Time Slots calendar</a>
    </p>
  `);

  await sendEmail({ to: SUPPORT_EMAIL, subject: `${args.subject} | Texas Jury Study`, html });
}
