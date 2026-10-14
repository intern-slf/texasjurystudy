/**
 * A small in-memory stand-in for the Supabase query builder, for the time-slot
 * booking tests. It runs the filters the code uses against plain arrays and
 * enforces the constraints the booking rules lean on, so a test can show two
 * firms racing for one slot and getting what Postgres would give them:
 *
 *   requestee_slot_bookings: case_id is the key (23505 on
 *   requestee_slot_bookings_pkey). Several cases can share a slot while the
 *   hours their firms pay for fit in it; a booking or a move past that, or a
 *   booked case's hours rising past it, gets 23514 "requestee_slot_full", as
 *   the triggers in 20261017_shared_slot_hours.sql give.
 *
 * select() understands one embed, `cases(...)` on requestee_slot_bookings,
 * which brings the booked case's row along as `cases`.
 *
 * No RLS: tests sign callers in and out through the server-client mock instead.
 */

export type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null; count?: number };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** Every write, in order, for assertions. */
  writes: Array<{ table: string; op: "insert" | "update" | "delete"; payload?: unknown }> = [];

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  reset(seed: Record<string, Row[]> = {}) {
    this.tables = Object.fromEntries(Object.entries(seed).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
    this.writes = [];
  }

  from(table: string) {
    return new Query(this, table);
  }

  /** The minutes a case is paid for: its hours, or 1 hour when empty or 0. */
  paidMinutes(caseId: unknown): number {
    const hours = Number(this.rows("cases").find((c) => c.id === caseId)?.hours_requested ?? 0);
    return hours > 0 ? hours * 60 : 60;
  }

  /** Minutes a slot has left for a case, not counting `caseId`'s own booking. Null for no such slot. */
  minutesLeft(slotId: unknown, caseId: unknown): number | null {
    const slot = this.rows("requestee_time_slots").find((s) => s.id === slotId);
    if (!slot) return null;
    const length = (Date.parse(String(slot.ends_at)) - Date.parse(String(slot.starts_at))) / 60_000;
    const taken = this.rows("requestee_slot_bookings")
      .filter((b) => b.slot_id === slotId && b.case_id !== caseId)
      .reduce((sum, b) => sum + this.paidMinutes(b.case_id), 0);
    return length - taken;
  }

  /** The constraint or trigger a write to `table` would trip, if any. */
  violation(table: string, candidate: Row, ignore?: Row): Result["error"] {
    const full = { code: "23514", message: "requestee_slot_full: no room left in this slot" };
    if (table === "cases" && ignore) {
      // A booked case's hours can't rise past what its slot has left.
      const before = Number(ignore.hours_requested ?? 0) > 0 ? Number(ignore.hours_requested) * 60 : 60;
      const after = Number(candidate.hours_requested ?? 0) > 0 ? Number(candidate.hours_requested) * 60 : 60;
      const booking = this.rows("requestee_slot_bookings").find((b) => b.case_id === candidate.id && b.slot_id != null);
      if (after > before && booking) {
        const left = this.minutesLeft(booking.slot_id, candidate.id);
        if (left !== null && after > left) return full;
      }
      return null;
    }
    if (table !== "requestee_slot_bookings") return null;
    const others = this.rows(table).filter((r) => r !== ignore);
    if (others.some((r) => r.case_id === candidate.case_id)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "requestee_slot_bookings_pkey"' };
    }
    if (candidate.slot_id != null && candidate.slot_id !== ignore?.slot_id) {
      const left = this.minutesLeft(candidate.slot_id, candidate.case_id);
      if (left !== null && this.paidMinutes(candidate.case_id) > left) return full;
    }
    return null;
  }
}

class Query implements PromiseLike<Result> {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private returning = false;
  private singleMode: "maybe" | "single" | null = null;
  private embedsCase = false;
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(columns?: string) {
    if (this.op !== "select") this.returning = true;
    if (this.table === "requestee_slot_bookings" && /\bcases\(/.test(columns ?? "")) this.embedsCase = true;
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  not(column: string, _op: "is", value: null) {
    this.filters.push((r) => (r[column] ?? null) !== value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  gt(column: string, value: string) {
    this.filters.push((r) => String(r[column]) > value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((r) => String(r[column]) < value);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }
  limit() {
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private matches(): Row[] {
    let rows = this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
    }
    return rows;
  }

  private shape(rows: Row[]): Result {
    const copy = (r: Row): Row =>
      this.embedsCase ? { ...r, cases: { ...(this.db.rows("cases").find((c) => c.id === r.case_id) ?? {}) } } : { ...r };
    if (this.singleMode) {
      if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
      return { data: rows[0] ? copy(rows[0]) : null, error: null };
    }
    return { data: rows.map(copy), error: null };
  }

  private run(): Result {
    const table = this.db.rows(this.table);

    if (this.op === "select") return this.shape(this.matches());

    if (this.op === "insert") {
      const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const added: Row[] = [];
      for (const row of incoming) {
        const error = this.db.violation(this.table, row);
        if (error) {
          // A failed statement adds nothing, like Postgres.
          for (const a of added) table.splice(table.indexOf(a), 1);
          return { data: null, error };
        }
        const copy = { ...row };
        table.push(copy);
        added.push(copy);
      }
      this.db.writes.push({ table: this.table, op: "insert", payload: this.payload });
      return this.returning ? this.shape(added) : { data: null, error: null };
    }

    if (this.op === "update") {
      const targets = this.matches();
      for (const row of targets) {
        const error = this.db.violation(this.table, { ...row, ...(this.payload as Row) }, row);
        if (error) return { data: null, error };
      }
      for (const row of targets) Object.assign(row, this.payload);
      this.db.writes.push({ table: this.table, op: "update", payload: this.payload });
      return this.returning ? this.shape(targets) : { data: null, error: null };
    }

    const targets = this.matches();
    for (const row of targets) table.splice(table.indexOf(row), 1);
    this.db.writes.push({ table: this.table, op: "delete" });
    return this.returning ? this.shape(targets) : { data: null, error: null };
  }
}
