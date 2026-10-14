import { describe, it, expect, vi, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
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

/* The pages that decide "past" (My Sessions, the participant dashboard, the
   admin lists and the sidebar count) aren't rendered by this suite, so this
   guards them by reading the source: today's date for a session date must come
   from centralToday(), and these patterns take it from the server's UTC clock
   (or the browser's). */
describe("nothing takes today's date from the UTC clock", () => {
  const CLIENT = fileURLToPath(new URL("..", import.meta.url));
  const UTC_TODAY = /new Date\(\)\.toISOString\(\)\.(slice\(0, ?10\)|split\(["']T["']\)\[0\])|\.setHours\(0, ?0, ?0, ?0\)/;
  /** Files that may, and why. */
  const ALLOWED: Record<string, string> = {
    "lib/timezone.ts": "falls back to today for a time read without a session date",
    "components/EditProfileForm.tsx": "the date-of-birth input's max, not a session date",
  };

  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });

  it("in app/, lib/ and components/", () => {
    const offenders = ["app", "lib", "components"]
      .flatMap((dir) => sourceFiles(join(CLIENT, dir)))
      .map((path) => relative(CLIENT, path).split(sep).join("/"))
      .filter((file) => !(file in ALLOWED))
      .flatMap((file) =>
        readFileSync(join(CLIENT, file), "utf8")
          .split("\n")
          .flatMap((text, i) => (UTC_TODAY.test(text) ? [`${file}:${i + 1}  ${text.trim()}`] : [])),
      );

    expect(
      offenders,
      "Use centralToday() from lib/centralToday for today's date. If a file really needs the UTC date, add it to ALLOWED with the reason.",
    ).toEqual([]);
  });
});
