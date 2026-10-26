import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { INVOICE_STATUS_LABEL, invoiceFooterNote, invoiceTotalLabel, type InvoiceStatus, type InvoiceView } from "@/lib/invoice";
import { formatCents } from "@/lib/receipt-pricing";
import { formatDeadline } from "@/lib/slotBooking";
import { formatCentralDate } from "@/lib/timezone";
import { LEGAL_ENTITY, MAILING_ADDRESS, SUPPORT_EMAIL } from "@/lib/legal-constants";

/**
 * The invoice as a PDF, attached to the email an admin sends the firm
 * (lib/invoiceEmail.ts). Drawn to match app/invoice/[caseId]: the navy band
 * with our logo, who it's billed to, the receipt's rows and the total. One
 * Letter page, continued onto more only if a case has very many filters.
 *
 * Uses the PDF standard fonts, which only cover Windows-1252, so any other
 * character a firm typed (an emoji in a case title) prints as "?" instead of
 * failing the send.
 */

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

// The page's colors: the brand navy and gold, Tailwind's slate, and the status pills.
const C = {
  navy: hex("#012A68"),
  navy50: hex("#EFF3F9"),
  navy200: hex("#C9D4EA"),
  red: hex("#C32130"),
  gold: hex("#AD8A37"),
  white: rgb(1, 1, 1),
  slate900: hex("#0F172A"),
  slate800: hex("#1E293B"),
  slate700: hex("#334155"),
  slate600: hex("#475569"),
  slate500: hex("#64748B"),
  slate200: hex("#E2E8F0"),
};

const PILL: Record<InvoiceStatus, { bg: RGB; fg: RGB }> = {
  paid: { bg: hex("#DCFCE7"), fg: hex("#15803D") },
  unpaid: { bg: hex("#FEF3C7"), fg: hex("#92400E") },
  overdue: { bg: hex("#F9E9EA"), fg: hex("#8F1A24") },
  void: { bg: hex("#F1F5F9"), fg: hex("#475569") },
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const RIGHT = PAGE_W - MARGIN;
const FOOTER_TOP = PAGE_H - 92;

/** "texasjurystudy.com", from the app's own address, for the footer. */
const SITE_HOST = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");

// Star from components/Logo.tsx, in its 332×113 viewBox.
const STAR =
  "M 43.50 22.00 L 52.03 48.26 L 79.64 48.26 L 57.30 64.49 L 65.84 90.74 " +
  "L 43.50 74.51 L 21.16 90.74 L 29.70 64.49 L 7.36 48.26 L 34.97 48.26 Z";

export function invoicePdfFileName(invoice: Pick<InvoiceView, "number">): string {
  return `Invoice ${invoice.number} - ${LEGAL_ENTITY}.pdf`.replace(/[^\x20-\x7E]/g, "");
}

type Fonts = { regular: PDFFont; bold: PDFFont; serifBold: PDFFont };

/** The text with anything the font can't encode replaced by "?". */
function printable(font: PDFFont, text: string): string {
  let out = "";
  for (const ch of text.normalize("NFC")) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

/** Breaks text into lines no wider than maxWidth, at spaces where it can. */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of printable(font, text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the line is cut wherever it has to be.
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

/** Draws into one page, measuring from the top as the page's layout does. */
class Pen {
  constructor(
    readonly page: PDFPage,
    readonly fonts: Fonts
  ) {}

  /** `top` is the baseline, from the top of the page. */
  text(
    text: string,
    x: number,
    top: number,
    { size, font = this.fonts.regular, color = C.slate900, align = "left", spacing = 0, opacity }: {
      size: number;
      font?: PDFFont;
      color?: RGB;
      align?: "left" | "right";
      /** Extra space between letters, in points: the page's tracking-[…] */
      spacing?: number;
      opacity?: number;
    }
  ): number {
    const s = printable(font, text);
    const width = this.width(s, size, font, spacing);
    const left = align === "right" ? x - width : x;
    if (!spacing) {
      this.page.drawText(s, { x: left, y: PAGE_H - top, size, font, color, opacity });
    } else {
      let cx = left;
      for (const ch of s) {
        this.page.drawText(ch, { x: cx, y: PAGE_H - top, size, font, color, opacity });
        cx += font.widthOfTextAtSize(ch, size) + spacing;
      }
    }
    return width;
  }

  width(text: string, size: number, font: PDFFont = this.fonts.regular, spacing = 0): number {
    const s = printable(font, text);
    return font.widthOfTextAtSize(s, size) + spacing * Math.max(0, [...s].length - 1);
  }

  rect(x: number, top: number, width: number, height: number, color: RGB, radius = 0) {
    if (!radius) {
      this.page.drawRectangle({ x, y: PAGE_H - top - height, width, height, color });
      return;
    }
    const r = Math.min(radius, height / 2, width / 2);
    const path =
      `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} ` +
      `A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
    this.page.drawSvgPath(path, { x, y: PAGE_H - top, color });
  }

  line(x1: number, x2: number, top: number, color: RGB, thickness = 1) {
    this.page.drawLine({ start: { x: x1, y: PAGE_H - top }, end: { x: x2, y: PAGE_H - top }, thickness, color });
  }

  /** components/Logo.tsx, `height` points tall, its top-left at (x, top). */
  logo(x: number, top: number, height: number) {
    const k = height / 113;
    this.rect(x + 89 * k, top, 243 * k, 62 * k, C.white);
    this.rect(x + 89 * k, top + 62 * k, 243 * k, 51 * k, C.red);
    this.rect(x, top, 89 * k, 113 * k, C.navy);
    this.page.drawSvgPath(STAR, { x, y: PAGE_H - top, scale: k, color: C.white });
    // The SVG stretches each word to a set width; here the letters are spaced out to it.
    this.fitted("TEXAS", x + 210.5 * k, top + 56 * k, 217 * k, 60.5 * k, C.red);
    this.fitted("JURY STUDY", x + 210.5 * k, top + 94 * k, 224 * k, 34.7 * k, C.white);
  }

  private fitted(text: string, centerX: number, baseline: number, targetWidth: number, size: number, color: RGB) {
    const font = this.fonts.serifBold;
    const natural = font.widthOfTextAtSize(text, size);
    const fittedSize = natural > targetWidth ? (size * targetWidth) / natural : size;
    const spacing = (targetWidth - font.widthOfTextAtSize(text, fittedSize)) / Math.max(1, text.length - 1);
    this.text(text, centerX - targetWidth / 2, baseline, { size: fittedSize, font, color, spacing });
  }
}

export async function renderInvoicePdf(invoice: InvoiceView): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Invoice ${invoice.number} - ${LEGAL_ENTITY}`, { showInWindowTitleBar: true });
  doc.setAuthor(LEGAL_ENTITY);
  doc.setSubject(`Invoice ${invoice.number}: ${invoice.caseTitle}`);
  doc.setCreator(LEGAL_ENTITY);
  doc.setProducer(LEGAL_ENTITY);

  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
  };
  const { regular, bold } = fonts;

  let pen = new Pen(doc.addPage([PAGE_W, PAGE_H]), fonts);
  const paid = invoice.status === "paid";
  const voided = invoice.status === "void";

  /* BAND */
  const bandHeight = MAILING_ADDRESS ? 150 : 128;
  pen.rect(0, 0, PAGE_W, bandHeight, C.navy);
  pen.rect(MARGIN, 36, 145, 60, C.white, 6);
  pen.logo(MARGIN + 8, 44, 44);
  if (MAILING_ADDRESS) pen.text(MAILING_ADDRESS, MARGIN, 118, { size: 10, color: C.navy200 });
  pen.text("INVOICE", RIGHT, 76, { size: 30, font: bold, color: C.white, align: "right", spacing: 3.6 });

  /* BILLED TO + STATUS */
  let top = bandHeight + 40;
  let left = top;
  pen.text("BILLED TO", MARGIN, left, { size: 8, font: bold, color: C.slate500, spacing: 1.1 });
  left += 18;
  for (const l of wrap(bold, invoice.billedTo.name, 14, 280)) {
    pen.text(l, MARGIN, left, { size: 14, font: bold });
    left += 17;
  }
  if (invoice.billedTo.email && invoice.billedTo.email !== invoice.billedTo.name) {
    pen.text(invoice.billedTo.email, MARGIN, left, { size: 10, color: C.slate600 });
    left += 14;
  }

  const pill = PILL[invoice.status];
  const label = INVOICE_STATUS_LABEL[invoice.status].toUpperCase();
  const pillWidth = pen.width(label, 8, bold, 1) + 24;
  pen.rect(RIGHT - pillWidth, top - 13, pillWidth, 20, pill.bg, 10);
  pen.text(label, RIGHT - 12, top + 0.5, { size: 8, font: bold, color: pill.fg, align: "right", spacing: 1 });
  let right = top + 24;
  const numberWidth = pen.text(invoice.number, RIGHT, right, { size: 10, font: bold, color: C.slate800, align: "right" });
  pen.text("Invoice # ", RIGHT - numberWidth, right, { size: 10, color: C.slate600, align: "right" });
  right += 15;
  pen.text(`Issued ${formatCentralDate(invoice.issuedAt) ?? "—"}`, RIGHT, right, { size: 10, color: C.slate600, align: "right" });
  right += 15;
  if (paid && invoice.paidAt) {
    pen.text(`Paid ${formatCentralDate(invoice.paidAt) ?? "—"}`, RIGHT, right, { size: 10, color: C.slate600, align: "right" });
    right += 15;
  }
  if (!paid && invoice.dueAt) {
    pen.text(`Due ${formatDeadline(invoice.dueAt)}`, RIGHT, right, { size: 10, color: C.slate600, align: "right" });
    right += 15;
  }

  top = Math.max(left, right) + 10;
  pen.rect(MARGIN, top, RIGHT - MARGIN, 2, C.gold);
  top += 2;

  /* ROWS: the same as the firm's Receipt Value */
  const tableHeader = () => {
    top += 22;
    pen.text("DESCRIPTION", MARGIN, top, { size: 8, font: bold, color: C.slate500, spacing: 1.1 });
    pen.text("AMOUNT", RIGHT, top, { size: 8, font: bold, color: C.slate500, spacing: 1.1, align: "right" });
    top += 10;
    pen.line(MARGIN, RIGHT, top, C.slate200);
  };
  const newPage = () => {
    pen = new Pen(doc.addPage([PAGE_W, PAGE_H]), fonts);
    top = MARGIN;
    tableHeader();
  };
  tableHeader();

  const descWidth = RIGHT - MARGIN - 110;
  for (const line of invoice.lines) {
    const desc = wrap(bold, line.description, 11, descWidth);
    const details = line.details.flatMap((d) => wrap(regular, d, 9.5, descWidth));
    const quantity = line.quantity ? wrap(regular, line.quantity, 9.5, descWidth) : [];
    const height = 18 + desc.length * 14 + details.length * 12.5 + (quantity.length ? 6 + quantity.length * 12.5 : 0) + 4;
    if (top + height > FOOTER_TOP - 24) newPage();

    let y = top + 4;
    for (const l of desc) pen.text(l, MARGIN, (y += 14), { size: 11, font: bold });
    for (const l of details) pen.text(l, MARGIN, (y += 12.5), { size: 9.5, color: C.slate500 });
    if (quantity.length) y += 6;
    for (const l of quantity) pen.text(l, MARGIN, (y += 12.5), { size: 9.5, color: C.slate700 });
    pen.text(formatCents(line.amountCents), RIGHT, y, { size: 11, font: bold, align: "right" });
    top = y + 14;
    pen.line(MARGIN, RIGHT, top, C.slate200);
  }

  /* TOTAL */
  if (top + 24 + 56 > FOOTER_TOP - 16) {
    pen = new Pen(doc.addPage([PAGE_W, PAGE_H]), fonts);
    top = MARGIN;
  }
  top += 24;
  pen.rect(MARGIN, top, RIGHT - MARGIN, 56, C.navy50, 10);
  pen.text(invoiceTotalLabel(invoice.status), MARGIN + 22, top + 32, { size: 12, font: bold, color: C.navy });
  const total = formatCents(invoice.totalCents);
  const totalWidth = pen.text(total, RIGHT - 22, top + 36, {
    size: 22,
    font: bold,
    color: C.navy,
    align: "right",
    opacity: voided ? 0.6 : undefined,
  });
  if (voided) pen.line(RIGHT - 22 - totalWidth, RIGHT - 22, top + 29, C.navy, 1.5);

  /* FOOTER, on the last page */
  pen.line(MARGIN, RIGHT, FOOTER_TOP, C.slate200);
  let foot = FOOTER_TOP + 18;
  for (const l of wrap(regular, invoiceFooterNote(invoice), 10, RIGHT - MARGIN)) {
    pen.text(l, MARGIN, foot, { size: 10, color: C.slate700 });
    foot += 14;
  }
  pen.text([LEGAL_ENTITY, SUPPORT_EMAIL, SITE_HOST].filter(Boolean).join("   ·   "), MARGIN, foot + 2, {
    size: 8.5,
    color: C.slate500,
  });

  return doc.save();
}
