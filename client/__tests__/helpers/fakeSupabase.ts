/**
 * A small in-memory stand-in for the Supabase query builder, for the time-slot
 * booking tests. It runs the filters the code uses against plain arrays and
 * enforces the constraints the booking rules lean on, so a test can show two
 * firms racing for one slot and getting what Postgres would give them:
 *
 *   requestee_slot_bookings: case_id is the key (23505 on
 *   requestee_slot_bookings_pkey), slot_id is unique (23505 on
 *   requestee_slot_bookings_slot_key).
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

  /** The unique-key violation a write to `table` would cause, if any. */
  violation(table: string, candidate: Row, ignore?: Row): Result["error"] {
    if (table !== "requestee_slot_bookings") return null;
    const others = this.rows(table).filter((r) => r !== ignore);
    if (others.some((r) => r.case_id === candidate.case_id)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "requestee_slot_bookings_pkey"' };
    }
    if (candidate.slot_id != null && others.some((r) => r.slot_id === candidate.slot_id)) {
      return { code: "23505", message: 'duplicate key value violates unique constraint "requestee_slot_bookings_slot_key"' };
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
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select() {
    if (this.op !== "select") this.returning = true;
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
    if (this.singleMode) {
      if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
      return { data: rows[0] ? { ...rows[0] } : null, error: null };
    }
    return { data: rows.map((r) => ({ ...r })), error: null };
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
