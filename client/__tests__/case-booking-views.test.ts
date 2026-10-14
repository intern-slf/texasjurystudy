import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactElement } from "react";
import CaseTimeSlotCard from "@/components/CaseTimeSlotCard";
import CaseBookingPanel from "@/components/CaseBookingPanel";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import RequesteeTimeSlotsPage from "@/app/dashboard/Admin/requestees/time-slots/page";
import { describeSlot } from "@/lib/requesteeTimeSlots";

/* ---------------------------------------------------------------------------
   What the booking boxes show when a read fails, and the Time Slots page's own
   admin check. The firm's "Focus group time" box (CaseTimeSlotCard) and the
   admin case page's "Time slot" box (CaseBookingPanel) are async server
   components: each is called and what it returns is rendered to HTML. Their
   client controls are replaced by markers.
--------------------------------------------------------------------------- */

const mocks = vi.hoisted(() => ({
  caseRow: { current: null as Record<string, unknown> | null },
  caseError: { current: null as { message: string } | null },
  getBookingsForCases: vi.fn(),
  getBookingsForSlots: vi.fn(),
  getOpenSlots: vi.fn(),
  requireAdminPage: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            mocks.caseError.current
              ? { data: null, error: mocks.caseError.current }
              : { data: mocks.caseRow.current, error: null },
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/requireRequestee", () => ({ requireRequestee: async () => "firm-1" }));
vi.mock("@/lib/requireAdmin", () => ({
  requireAdmin: async () => "admin-1",
  requireAdminPage: mocks.requireAdminPage,
}));
vi.mock("@/lib/slotBookingData", () => ({
  getBookingsForCases: mocks.getBookingsForCases,
  getBookingsForSlots: mocks.getBookingsForSlots,
  getOpenSlots: mocks.getOpenSlots,
  toBookingView: () => ({}),
}));
vi.mock("@/components/CaseTimeSlotControls", () => ({ default: () => "[time controls]" }));
vi.mock("@/components/BookingSummary", () => ({ default: () => "[booking summary]" }));
vi.mock("@/components/BookingAdminControls", () => ({
  default: ({ openSlotsUnavailable }: { openSlotsUnavailable?: boolean }) =>
    openSlotsUnavailable ? "[booking controls, open times unavailable]" : "[booking controls]",
}));
vi.mock("@/components/AssignSlotControl", () => ({ default: () => "[assign slot]" }));
vi.mock("@/components/TimeSlotCalendar", () => ({ default: () => "[calendar]" }));
vi.mock("@/components/BackButton", () => ({ default: () => "[back]" }));

const SLOT = {
  id: "slot-1",
  starts_at: "2026-11-05T16:00:00.000Z",
  ends_at: "2026-11-05T18:00:00.000Z",
  note: null,
};

/** An online case under review, owned by the signed-in firm. */
const UNDER_REVIEW = {
  user_id: "firm-1",
  requestee_id: null,
  admin_status: "all",
  status: "current",
  deleted_at: null,
  delivery_mode: "online",
  hours_requested: 2,
};

/** The case's booking record: it holds SLOT, unpaid, its clock started an hour ago. */
const held = () =>
  new Map([
    [
      "case-1",
      {
        case_id: "case-1",
        slot_id: SLOT.id,
        booked_by: "firm-1",
        held_since: "2026-10-14T14:00:00.000Z",
        paid_at: null,
        slot: SLOT,
      },
    ],
  ]);

const html = (element: ReactElement | null) => (element ? renderToStaticMarkup(element) : "");

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
  mocks.caseRow.current = UNDER_REVIEW;
  mocks.caseError.current = null;
  for (const fn of [mocks.getBookingsForCases, mocks.getBookingsForSlots, mocks.getOpenSlots, mocks.requireAdminPage, mocks.createClient]) {
    fn.mockReset();
  }
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  errorSpy.mockRestore();
});

describe("the firm's Focus group time box", () => {
  it("still shows the held time and its deadline when the open times can't be read", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockRejectedValue(new Error("open times read failed"));

    const page = html(await CaseTimeSlotCard({ caseId: "case-1" }));

    expect(page).toContain(describeSlot(SLOT));
    expect(page).toContain("Payment is due by");
    expect(page).toContain("load our open times");
    expect(page).not.toContain("[time controls]");
    expect(errorSpy).toHaveBeenCalledWith("[CaseTimeSlotCard] couldn't read the open times:", expect.any(Error));
  });

  it("shows the controls when both reads work", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockResolvedValue([]);

    const page = html(await CaseTimeSlotCard({ caseId: "case-1" }));

    expect(page).toContain(describeSlot(SLOT));
    expect(page).toContain("[time controls]");
  });

  it("shows nothing when the booking itself can't be read", async () => {
    mocks.getBookingsForCases.mockRejectedValue(new Error("no table"));

    expect(await CaseTimeSlotCard({ caseId: "case-1" })).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith("[CaseTimeSlotCard] couldn't read the booking:", expect.any(Error));
  });

  it("doesn't point at open times below when it couldn't load any", async () => {
    mocks.getBookingsForCases.mockResolvedValue(new Map());
    mocks.getOpenSlots.mockRejectedValue(new Error("open times read failed"));

    const page = html(await CaseTimeSlotCard({ caseId: "case-1" }));

    expect(page).not.toContain("open times below");
    expect(page).toContain("load our open times");
  });

  it("points at open times below only when one fits the case", async () => {
    // The case asks for 2 hours. Right after launch nothing is open at all.
    const ONE_HOUR = { ...SLOT, id: "slot-short", ends_at: "2026-11-05T17:00:00.000Z" };
    mocks.getBookingsForCases.mockResolvedValue(new Map());

    for (const [open, shown] of [[[], false], [[ONE_HOUR], false], [[SLOT], true]] as const) {
      mocks.getOpenSlots.mockResolvedValue(open);
      const page = html(await CaseTimeSlotCard({ caseId: "case-1" }));
      expect(page.includes("open times below"), `${open.length} open`).toBe(shown);
      expect(page).toContain("[time controls]");
    }
  });
});

describe("the time picker", () => {
  const empty = (timingQuestionsBelow?: boolean) =>
    renderToStaticMarkup(
      createElement(TimeSlotPicker, { slots: [], hoursRequested: 2, value: null, onChange: () => {}, timingQuestionsBelow })
    );

  it("says nothing fits, and asks about preferred timing only where the form does", () => {
    expect(empty()).toContain("No open time fits 2 hours right now");
    expect(empty()).toContain('href="mailto:info@texasjurystudy.com"');
    expect(empty()).not.toContain("preferred timing below");
    expect(empty(true)).toContain("preferred timing below");
  });
});

describe("the admin case page's Time slot box", () => {
  it("logs a failed read of the booking's details and says so, instead of blaming a race", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockResolvedValue([]);
    mocks.getBookingsForSlots.mockRejectedValue(new Error("details read failed"));

    const page = html(await CaseBookingPanel({ caseId: "case-1" }));

    expect(page).toContain("booking. Reload the page.");
    expect(page).not.toContain("changed while the page loaded");
    expect(errorSpy).toHaveBeenCalledWith("[CaseBookingPanel] couldn't read the booking's details:", expect.any(Error));
  });

  it("says the booking changed when it's gone by the second read", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockResolvedValue([]);
    mocks.getBookingsForSlots.mockResolvedValue(new Map());

    expect(html(await CaseBookingPanel({ caseId: "case-1" }))).toContain("changed while the page loaded");
  });

  it("shows the booking and its controls when every read works", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockResolvedValue([]);
    mocks.getBookingsForSlots.mockResolvedValue(new Map([[SLOT.id, [{ case_id: "case-1" }]]]));

    const page = html(await CaseBookingPanel({ caseId: "case-1" }));

    expect(page).toContain(describeSlot(SLOT));
    expect(page).toContain("[booking summary]");
    expect(page).toContain("[booking controls]");
  });

  it("shows this case's booking, not another case's in the same slot", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockResolvedValue([]);
    // Another case shares the slot, and this case's own booking isn't there.
    mocks.getBookingsForSlots.mockResolvedValue(new Map([[SLOT.id, [{ case_id: "case-2" }]]]));

    const page = html(await CaseBookingPanel({ caseId: "case-1" }));

    expect(page).toContain("changed while the page loaded");
    expect(page).not.toContain("[booking summary]");
  });

  it("points at the migrations when the first read fails", async () => {
    mocks.getBookingsForCases.mockRejectedValue(new Error("no table"));
    mocks.getOpenSlots.mockResolvedValue([]);

    expect(html(await CaseBookingPanel({ caseId: "case-1" }))).toContain("time-slot migrations");
  });

  it("keeps the booking in view when only the open times fail", async () => {
    mocks.getBookingsForCases.mockResolvedValue(held());
    mocks.getOpenSlots.mockRejectedValue(new Error("open times read failed"));
    mocks.getBookingsForSlots.mockResolvedValue(new Map([[SLOT.id, [{ case_id: "case-1" }]]]));

    const page = html(await CaseBookingPanel({ caseId: "case-1" }));

    expect(page).toContain(describeSlot(SLOT));
    expect(page).toContain("[booking summary]");
    // The move list is told, so it doesn't claim there are no other open times.
    expect(page).toContain("[booking controls, open times unavailable]");
    expect(page).toContain("load the open times");
    expect(page).not.toContain("time-slot migrations");
    expect(errorSpy).toHaveBeenCalledWith("[CaseBookingPanel] couldn't read the open times:", expect.any(Error));
  });

  it("puts the note in place of booking a time when there's no booking and the open times fail", async () => {
    mocks.getBookingsForCases.mockResolvedValue(new Map());
    mocks.getOpenSlots.mockRejectedValue(new Error("open times read failed"));

    const page = html(await CaseBookingPanel({ caseId: "case-1" }));

    expect(page).toContain("load the open times");
    expect(page).not.toContain("[assign slot]");
  });

  it("says so, and logs it, when the case can't be read", async () => {
    mocks.caseError.current = { message: "case read failed" };
    mocks.getBookingsForCases.mockResolvedValue(new Map());
    mocks.getOpenSlots.mockResolvedValue([]);

    expect(html(await CaseBookingPanel({ caseId: "case-1" }))).toContain("Reload the page.");
    expect(errorSpy).toHaveBeenCalledWith("[CaseBookingPanel] couldn't read the case:", "case read failed");
  });
});

describe("the Time Slots page", () => {
  it("checks for an admin before reading anything", async () => {
    mocks.requireAdminPage.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(RequesteeTimeSlotsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.getBookingsForSlots).not.toHaveBeenCalled();
    expect(mocks.getOpenSlots).not.toHaveBeenCalled();
  });
});
