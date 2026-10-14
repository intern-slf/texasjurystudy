import { describe, it, expect, vi, afterEach } from "vitest";
import { centralToday } from "@/lib/centralToday";
import { getCaseSessions } from "@/lib/case/getCaseSessions";
import { getParticipantSessionHistory } from "@/lib/participant/getParticipantSessionHistory";

/* ---------------------------------------------------------------------------
   "Today" for sessions is the Central date: sessions.session_date is a Central
   calendar date. The server runs in UTC, whose date turns over at 7 PM CDT /
   6 PM CST, and comparing session dates with it marked each day's evening
   sessions as past while they were starting.

   Rows are served by table name, as in case-lineage.test.ts, because the
   readers below ask for several tables at once.
--------------------------------------------------------------------------- */

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]> } = { tables: {} };

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
    from(table: string) {
      let rows = [...(db.tables[table] ?? [])];
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: readonly unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        single: async () => ({ data: rows[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeClient() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: fakeClient() }));

/** 7:05 PM CDT on Tue Oct 20, when the UTC date is already Oct 21. */
const EVENING_OCT_20 = "2026-10-21T00:05:00Z";
/** Midnight CDT, the start of Oct 21 in Central Time. */
const MIDNIGHT_OCT_21 = "2026-10-21T05:00:00Z";

const at = (iso: string) => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
};

afterEach(() => vi.useRealTimers());

describe("centralToday", () => {
  it("is the Central date, which the UTC date runs ahead of in the evening", () => {
    expect(centralToday(new Date(EVENING_OCT_20))).toBe("2026-10-20");
    expect(centralToday(new Date("2026-10-21T04:59:59Z"))).toBe("2026-10-20");
    expect(centralToday(new Date(MIDNIGHT_OCT_21))).toBe("2026-10-21");
  });

  it("turns over at midnight Central on standard time too", () => {
    // 6:00 PM CST on Nov 5, then 11:59 PM, then midnight.
    expect(centralToday(new Date("2026-11-06T00:00:00Z"))).toBe("2026-11-05");
    expect(centralToday(new Date("2026-11-06T05:59:59Z"))).toBe("2026-11-05");
    expect(centralToday(new Date("2026-11-06T06:00:00Z"))).toBe("2026-11-06");
  });

  it("reads the clock by default", () => {
    at(EVENING_OCT_20);
    expect(centralToday()).toBe("2026-10-20");
  });
});

describe("an evening session stays upcoming until Central midnight", () => {
  // 7:00-9:00 PM CDT on Oct 20, stored as 00:00-02:00 UTC.
  const session = { id: "s-1", session_date: "2026-10-20", zoom_link: null, location: null, participant_cap: 10 };
  const times = { start_time: "00:00:00", end_time: "02:00:00" };

  it("on the admin case page, which badged it Completed", async () => {
    db.tables = {
      session_cases: [{ case_id: "c-1", session_id: "s-1", ...times }],
      cases: [{ id: "c-1", delivery_mode: "online" }],
      sessions: [session],
      session_participants: [],
    };

    at(EVENING_OCT_20);
    expect((await getCaseSessions("c-1")).map((s) => s.isPast)).toEqual([false]);
    at(MIDNIGHT_OCT_21);
    expect((await getCaseSessions("c-1")).map((s) => s.isPast)).toEqual([true]);
  });

  it("in a participant's session history, which filed it under Past", async () => {
    db.tables = {
      roles: [{ user_id: "admin-1", role: "admin" }],
      session_participants: [
        {
          participant_id: "p-1",
          session_id: "s-1",
          invite_status: "accepted",
          responded_at: null,
          struck_at: null,
          sessions: {
            session_date: session.session_date,
            session_cases: [{ ...times, cases: { id: "c-1", title: "Smith v. Jones" } }],
          },
        },
      ],
    };

    at(EVENING_OCT_20);
    let history = await getParticipantSessionHistory(["p-1"]);
    expect(history?.upcoming.map((s) => s.sessionId)).toEqual(["s-1"]);
    expect(history?.stats.attended).toBe(0);

    at(MIDNIGHT_OCT_21);
    history = await getParticipantSessionHistory(["p-1"]);
    expect(history?.past.map((s) => s.sessionId)).toEqual(["s-1"]);
    expect(history?.stats.attended).toBe(1);
  });
});
