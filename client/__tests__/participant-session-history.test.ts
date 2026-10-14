import { describe, it, expect, vi, afterEach } from "vitest";
import { getParticipantSessionHistory } from "@/lib/participant/getParticipantSessionHistory";

/* ---------------------------------------------------------------------------
   The time range on the admin "Session History" panel of a participant's
   profile. Case times are stored as UTC times of day and the session date is a
   Central date, so the range has to be read on the session's own date, and an
   evening session's later cases fall on the next UTC day.
--------------------------------------------------------------------------- */

// The invites the service-role read returns.
const invites: { rows: unknown[] } = { rows: [] };

// The caller is an admin: getUser, then their roles row.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "admin-1" } } })) },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { role: "admin" }, error: null }) }),
      }),
    })),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: () => ({ in: async () => ({ data: invites.rows, error: null }) }),
    })),
  },
}));

/** An accepted invite to a session on `sessionDate` with these [start, end] case times (UTC). */
const invite = (sessionDate: string, times: Array<[start: string, end: string]>) => ({
  session_id: `s-${sessionDate}`,
  invite_status: "accepted",
  responded_at: null,
  struck_at: null,
  sessions: {
    session_date: sessionDate,
    session_cases: times.map(([start_time, end_time], i) => ({
      start_time,
      end_time,
      cases: { id: `case-${i}`, title: `Case ${i}` },
    })),
  },
});

/** Each row's time range, with the narrow space some ICU versions put before AM/PM made plain. */
const ranges = (rows: Array<{ timeRange: string }> | undefined) =>
  rows?.map((r) => r.timeRange.replace(/\s/g, " "));

describe("getParticipantSessionHistory time range", () => {
  afterEach(() => vi.useRealTimers());

  it("reads a November session in Central Standard Time while it is still October", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
    invites.rows = [invite("2026-11-05", [["16:00:00", "18:00:00"]])];

    const history = await getParticipantSessionHistory(["p-1"]);

    // Read on today's October date, 16:00 UTC came out as 11:00 AM.
    expect(ranges(history?.upcoming)).toEqual(["10:00 AM – 12:00 PM CT"]);
  });

  it("reads an October session in Central Daylight Time once it is November", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
    invites.rows = [invite("2026-10-29", [["15:00:00", "17:00:00"]])];

    const history = await getParticipantSessionHistory(["p-1"]);

    expect(ranges(history?.past)).toEqual(["10:00 AM – 12:00 PM CT"]);
  });

  it("spans an evening session from its first case, across midnight UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-14T15:00:00Z"));
    // 5-6 PM and 6-7 PM CST, stored 23:00-00:00 and 00:00-01:00 UTC.
    invites.rows = [invite("2026-11-05", [["00:00:00", "01:00:00"], ["23:00:00", "00:00:00"]])];

    const history = await getParticipantSessionHistory(["p-1"]);

    // Sorted as text, "00:00" came first: "6:00 PM – 7:00 PM CT".
    expect(ranges(history?.upcoming)).toEqual(["5:00 PM – 7:00 PM CT"]);
  });

  it("says Time TBD for a session with no case times", async () => {
    invites.rows = [invite("2026-11-05", [])];

    const history = await getParticipantSessionHistory(["p-1"]);

    expect(ranges([...(history?.past ?? []), ...(history?.upcoming ?? [])])).toEqual(["Time TBD"]);
  });
});
