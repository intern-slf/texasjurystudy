import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
// The calendar's buttons call these; nothing here clicks them.
vi.mock("@/lib/actions/requesteeTimeSlots", () => ({ deleteRequesteeTimeSlot: vi.fn(), createRequesteeTimeSlots: vi.fn() }));
vi.mock("@/lib/actions/session", () => ({ addSlotCasesToSession: vi.fn() }));
vi.mock("@/lib/actions/adminSlotBooking", () => ({
  cancelBooking: vi.fn(),
  markBookingPaid: vi.fn(),
  markBookingUnpaid: vi.fn(),
  moveBooking: vi.fn(),
  assignSlot: vi.fn(),
}));

import { sessionPrefill } from "@/lib/case/slotPrefill";
import { isOutsideSlot, type BookingView } from "@/lib/slotBooking";
import CaseTimeInputs from "@/components/CaseTimeInputs";
import { BuildSessionLink, SessionLine } from "@/components/TimeSlotCalendar";

/* ---------------------------------------------------------------------------
   The Time Slots calendar and Build Session working together. A slot is sold
   by the hour to several firms, so its cases make one session: Build Session
   starts from the slot's date with the cases one after another, and the
   calendar shows each booked case's session, warning when it runs outside the
   slot. Everything can still be changed: these only fill in and warn.
--------------------------------------------------------------------------- */

// Thursday Oct 29, 9 AM - 12 PM CDT; Thursday Nov 5, 9 AM - 12 PM CST.
const OCT_SLOT = { id: "slot-oct", starts_at: "2026-10-29T14:00:00.000Z", ends_at: "2026-10-29T17:00:00.000Z", note: null };
const NOV_SLOT = { id: "slot-nov", starts_at: "2026-11-05T15:00:00.000Z", ends_at: "2026-11-05T18:00:00.000Z", note: null };

describe("Build Session's starting point from the booked slot", () => {
  it("takes the slot's date and puts its cases one after another, earliest booking first", () => {
    const prefill = sessionPrefill([
      { caseId: "a", hoursRequested: 1, heldSince: "2026-10-21T10:00:00Z", slot: OCT_SLOT },
      { caseId: "b", hoursRequested: 2, heldSince: "2026-10-20T10:00:00Z", slot: OCT_SLOT },
      { caseId: "c", hoursRequested: null, heldSince: null, slot: null },
    ]);
    // b booked first and takes 2 hours, so a starts at 11.
    expect(prefill).toMatchObject({ date: "2026-10-29", starts: { b: "09:00", a: "11:00" }, otherSlots: [] });
    expect(prefill?.slot.id).toBe("slot-oct");
    expect(prefill?.starts).not.toHaveProperty("c");
  });

  it("reads the slot's Central clock on standard time too, and counts an empty request as 1 hour", () => {
    const prefill = sessionPrefill([
      { caseId: "a", hoursRequested: null, heldSince: "2026-10-20T10:00:00Z", slot: NOV_SLOT },
      { caseId: "b", hoursRequested: 1, heldSince: "2026-10-21T10:00:00Z", slot: NOV_SLOT },
    ]);
    expect(prefill).toMatchObject({ date: "2026-11-05", starts: { a: "09:00", b: "10:00" } });
  });

  it("uses the slot the calendar link came from, and names the others", () => {
    const cases = [
      { caseId: "a", hoursRequested: 1, heldSince: "2026-10-20T10:00:00Z", slot: NOV_SLOT },
      { caseId: "b", hoursRequested: 1, heldSince: "2026-10-20T11:00:00Z", slot: NOV_SLOT },
      { caseId: "c", hoursRequested: 1, heldSince: "2026-10-20T12:00:00Z", slot: OCT_SLOT },
    ];
    expect(sessionPrefill(cases, "slot-oct")).toMatchObject({
      date: "2026-10-29",
      starts: { c: "09:00" },
      otherSlots: [NOV_SLOT],
    });
    // Without one, the slot most of the cases booked, though another is earlier.
    expect(sessionPrefill(cases)?.slot.id).toBe("slot-nov");
    expect(sessionPrefill(cases, "slot-gone")?.slot.id).toBe("slot-nov");
  });

  it("is nothing when no case booked a slot", () => {
    expect(sessionPrefill([{ caseId: "a", hoursRequested: 1, heldSince: null, slot: null }])).toBeNull();
    expect(sessionPrefill([])).toBeNull();
  });

  it("starts the case's time picker there, ending after the time it paid for", () => {
    const html = renderToStaticMarkup(
      createElement(CaseTimeInputs, { caseId: "c1", hoursRequested: 2, initialStart: "10:00" }),
    );
    expect(html).toContain('name="start_c1" value="10:00"');
    expect(html).toMatch(/<option value="12:00" selected="">12:00 \(2 hours\)<\/option>/);
  });
});

describe("a session outside its booked slot", () => {
  const at = (iso: string) => new Date(iso);

  it("is any part of it before the slot starts or after it ends", () => {
    expect(isOutsideSlot(at("2026-10-29T14:00:00Z"), at("2026-10-29T15:00:00Z"), OCT_SLOT)).toBe(false);
    expect(isOutsideSlot(at("2026-10-29T16:00:00Z"), at("2026-10-29T17:00:00Z"), OCT_SLOT)).toBe(false);
    expect(isOutsideSlot(at("2026-10-29T13:30:00Z"), at("2026-10-29T14:30:00Z"), OCT_SLOT)).toBe(true);
    expect(isOutsideSlot(at("2026-10-29T16:30:00Z"), at("2026-10-29T17:30:00Z"), OCT_SLOT)).toBe(true);
    expect(isOutsideSlot(at("2026-10-30T14:00:00Z"), null, OCT_SLOT)).toBe(true);
  });
});

describe("the calendar's booked cases", () => {
  const booking = (over: Partial<BookingView>): BookingView => ({
    caseId: "case-1",
    slotId: OCT_SLOT.id,
    minutes: 60,
    caseTitle: "Smith v. Jones",
    firm: "Jane Roe",
    state: "paid",
    paidAt: null,
    dueAt: null,
    warnings: [],
    approved: true,
    session: null,
    ...over,
  });
  const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el).replace(/\s/g, " ");

  it("show the session a case is in, and warn when it runs outside the slot", () => {
    expect(html(createElement(SessionLine, { booking: booking({}) }))).toContain("No session built yet.");
    const inSession = booking({ session: { date: "Oct 29, 2026", time: "9:00 AM – 10:00 AM CT", outsideSlot: false, id: "s-1", invited: false } });
    const page = html(createElement(SessionLine, { booking: inSession }));
    expect(page).toContain("Oct 29, 2026, 9:00 AM – 10:00 AM CT");
    expect(page).not.toContain("outside this booked slot");
    const outside = booking({ session: { date: "Oct 30, 2026", time: "9:00 AM – 10:00 AM CT", outsideSlot: true, id: "s-1", invited: false } });
    expect(html(createElement(SessionLine, { booking: outside }))).toContain("The session runs outside this booked slot");
  });

  it("go into Build Session together when approved and not in a session yet", () => {
    const list = [
      booking({ caseId: "case-1" }),
      booking({ caseId: "case-2" }),
      booking({ caseId: "case-3", approved: false }),
    ];
    const page = html(createElement(BuildSessionLink, { slot: OCT_SLOT, list }));
    expect(page).toContain("Build session with 2 cases");
    expect(page).toContain('href="/dashboard/Admin/sessions/new?slot=slot-oct&amp;selectedCases=case-1&amp;selectedCases=case-2"');
    expect(page).toContain("1 case isn&#x27;t approved yet, so it isn&#x27;t included.");
  });

  it("join the session already built for the slot, instead of building a second one", () => {
    const session = { id: "s-1", date: "Oct 29, 2026", time: "9:00 AM – 10:00 AM CT", outsideSlot: false, invited: false };
    const list = [booking({ caseId: "case-1", session }), booking({ caseId: "case-2" }), booking({ caseId: "case-3" })];
    const page = html(createElement(BuildSessionLink, { slot: OCT_SLOT, list }));
    expect(page).toContain("Add 2 cases to the session on Oct 29, 2026");
    expect(page).not.toContain("Build session");
    expect(page).not.toContain("sessions/new");
  });

  it("offer nothing to build when every case is already in a session", () => {
    const list = [booking({ session: { date: "Oct 29, 2026", time: null, outsideSlot: false, id: "s-1", invited: false } })];
    expect(renderToStaticMarkup(createElement(BuildSessionLink, { slot: OCT_SLOT, list }))).toBe("");
  });
});
