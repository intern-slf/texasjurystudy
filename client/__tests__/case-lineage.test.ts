import { describe, it, expect, vi } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://supabase.test";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-test-key";

// The module only imports `createClient` for the default-client path; every test
// here hands in an explicit fake client, so the real one is never constructed.
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("tests must pass an explicit client");
  }),
}));

import {
  getLineageParticipantInvolvement,
  getLineageParticipantIds,
  splitLineageInvolvement,
  isLineageBlocking,
  type LineageInvolvement,
} from "@/lib/case-lineage";

/* ---------------------------------------------------------------------------
   Table-keyed fake client.

   `getLineageParticipantInvolvement` fires `sessions` and `session_participants`
   concurrently, so a FIFO response queue would depend on Promise.all ordering.
   Serving rows by table name keeps the test honest about *what* was asked for.
--------------------------------------------------------------------------- */
type Row = Record<string, unknown>;
type Client = Parameters<typeof getLineageParticipantInvolvement>[1];

interface Builder {
  select: (...args: unknown[]) => Builder;
  in: (col: string, vals: readonly unknown[]) => Builder;
  eq: (col: string, val: unknown) => Builder;
  then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise<unknown>;
}

function fakeClient(tables: Record<string, Row[]>): Client {
  return {
    from(table: string): Builder {
      let rows = [...(tables[table] ?? [])];
      const builder: Builder = {
        select: () => builder,
        in: (col, vals) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        eq: (col, val) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        then: (resolve) => Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  } as unknown as Client;
}

const dateOffsetDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const TODAY = new Date().toISOString().slice(0, 10);
const FUTURE = dateOffsetDays(14);
const PAST = dateOffsetDays(-14);

/** One case (`c-1`) whose sessions are supplied by the caller. */
function lineage(
  sessions: { id: string; session_date: string }[],
  invites: {
    participant_id: string;
    session_id: string;
    invite_status: string | null;
    struck_at?: string | null;
  }[]
) {
  return fakeClient({
    session_cases: sessions.map((s) => ({ case_id: "c-1", session_id: s.id })),
    sessions,
    session_participants: invites.map((i) => ({ struck_at: null, ...i })),
  });
}

describe("case-lineage involvement classification", () => {
  it("blocks someone who accepted a case in the chain", async () => {
    const client = lineage(
      [{ id: "s-past", session_date: PAST }],
      [{ participant_id: "p-1", session_id: "s-past", invite_status: "accepted" }]
    );

    expect(await getLineageParticipantIds(["c-1"], client)).toEqual(["p-1"]);
  });

  it("frees someone who accepted but was struck — they never sat on the case", async () => {
    const client = lineage(
      [{ id: "s-past", session_date: PAST }],
      [
        {
          participant_id: "p-1",
          session_id: "s-past",
          invite_status: "accepted",
          struck_at: "2026-01-01T00:00:00Z",
        },
      ]
    );

    const involvement = await getLineageParticipantInvolvement(["c-1"], client);
    expect(involvement.get("p-1")).toBe("struck");
    expect(await getLineageParticipantIds(["c-1"], client)).toEqual([]);
  });

  it("frees someone who declined", async () => {
    const client = lineage(
      [{ id: "s-past", session_date: PAST }],
      [{ participant_id: "p-1", session_id: "s-past", invite_status: "declined" }]
    );

    const involvement = await getLineageParticipantInvolvement(["c-1"], client);
    expect(involvement.get("p-1")).toBe("declined");
    expect(await getLineageParticipantIds(["c-1"], client)).toEqual([]);
  });

  it("treats a 'rejected' status the same as declined", async () => {
    const client = lineage(
      [{ id: "s-past", session_date: PAST }],
      [{ participant_id: "p-1", session_id: "s-past", invite_status: "rejected" }]
    );

    expect((await getLineageParticipantInvolvement(["c-1"], client)).get("p-1")).toBe("declined");
  });

  it("frees an unanswered invite once its session is in the past", async () => {
    const client = lineage(
      [{ id: "s-past", session_date: PAST }],
      [{ participant_id: "p-1", session_id: "s-past", invite_status: "pending" }]
    );

    const involvement = await getLineageParticipantInvolvement(["c-1"], client);
    expect(involvement.get("p-1")).toBe("no-response");
    expect(await getLineageParticipantIds(["c-1"], client)).toEqual([]);
  });

  it("blocks an unanswered invite while its session is still upcoming", async () => {
    const client = lineage(
      [{ id: "s-next", session_date: FUTURE }],
      [{ participant_id: "p-1", session_id: "s-next", invite_status: "pending" }]
    );

    const involvement = await getLineageParticipantInvolvement(["c-1"], client);
    expect(involvement.get("p-1")).toBe("pending-upcoming");
    expect(await getLineageParticipantIds(["c-1"], client)).toEqual(["p-1"]);
  });

  it("counts a session dated today as upcoming, not past", async () => {
    const client = lineage(
      [{ id: "s-today", session_date: TODAY }],
      [{ participant_id: "p-1", session_id: "s-today", invite_status: null }]
    );

    expect((await getLineageParticipantInvolvement(["c-1"], client)).get("p-1")).toBe(
      "pending-upcoming"
    );
  });

  it("lets the blocking involvement win when someone appears twice in the chain", async () => {
    const client = lineage(
      [
        { id: "s-past", session_date: PAST },
        { id: "s-next", session_date: FUTURE },
      ],
      [
        { participant_id: "p-1", session_id: "s-past", invite_status: "declined" },
        { participant_id: "p-1", session_id: "s-next", invite_status: "pending" },
        { participant_id: "p-2", session_id: "s-past", invite_status: "accepted" },
        { participant_id: "p-2", session_id: "s-next", invite_status: "declined" },
      ]
    );

    const involvement = await getLineageParticipantInvolvement(["c-1"], client);
    expect(involvement.get("p-1")).toBe("pending-upcoming");
    expect(involvement.get("p-2")).toBe("accepted");
    expect((await getLineageParticipantIds(["c-1"], client)).sort()).toEqual(["p-1", "p-2"]);
  });

  it("returns nothing for a case with no sessions", async () => {
    const client = lineage([], []);
    expect(await getLineageParticipantInvolvement(["c-1"], client)).toEqual(new Map());
    expect(await getLineageParticipantIds([], client)).toEqual([]);
  });
});

describe("splitLineageInvolvement", () => {
  it("separates blocking ids from history worth showing", () => {
    const involvement = new Map<string, LineageInvolvement>([
      ["p-accepted", "accepted"],
      ["p-live", "pending-upcoming"],
      ["p-struck", "struck"],
      ["p-declined", "declined"],
      ["p-silent", "no-response"],
    ]);

    const { blockedIds, priorInvolvement } = splitLineageInvolvement(involvement);

    expect(blockedIds.sort()).toEqual(["p-accepted", "p-live"]);
    expect([...priorInvolvement.keys()].sort()).toEqual(["p-declined", "p-silent", "p-struck"]);
    // Nobody may appear in both — a blocked row is never selectable.
    expect(blockedIds.some((id) => priorInvolvement.has(id))).toBe(false);
  });

  it("agrees with isLineageBlocking", () => {
    expect(isLineageBlocking("accepted")).toBe(true);
    expect(isLineageBlocking("pending-upcoming")).toBe(true);
    expect(isLineageBlocking("struck")).toBe(false);
    expect(isLineageBlocking("declined")).toBe(false);
    expect(isLineageBlocking("no-response")).toBe(false);
  });
});
