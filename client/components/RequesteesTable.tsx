"use client";

import { Fragment, useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ChevronRight, Search, X } from "lucide-react";

export type RequesteeCase = {
  id: string;
  title: string;
  admin_status: string | null;
  created_at: string | null;
  deleted_at: string | null;
};

export type RequesteeRow = {
  user_id: string;
  /** Confirmed full name from the signed confidentiality agreement. */
  name: string | null;
  email: string | null;
  joined_at: string | null;
  agreed_at: string | null;
  /** Newest first. Includes cases the requestee soft-deleted. */
  cases: RequesteeCase[];
};

type Props = {
  requestees: RequesteeRow[];
};

type Filter = "all" | "awaiting" | "no_cases" | "unsigned";

const fmtDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

const BADGE = "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset";

function caseBadge(c: RequesteeCase) {
  if (c.deleted_at) {
    return { label: "Deleted", className: "bg-slate-400/10 text-slate-600 ring-slate-400/20" };
  }
  switch (c.admin_status) {
    case "approved":
      return { label: "Approved", className: "bg-green-400/10 text-green-600 ring-green-400/20" };
    case "submitted":
      return { label: "Submitted", className: "bg-green-400/10 text-green-600 ring-green-400/20" };
    case "rejected":
      return { label: "Rejected", className: "bg-red-400/10 text-red-600 ring-red-400/20" };
    default:
      return { label: "Requested", className: "bg-amber-400/10 text-amber-700 ring-amber-400/30" };
  }
}

const isLive = (c: RequesteeCase) => !c.deleted_at;
const isAwaitingReview = (c: RequesteeCase) => isLive(c) && c.admin_status === "all";

export default function RequesteesTable({ requestees }: Props) {
  const [query, setQuery] = useState("");
  // Keep the input bound to `query` (instant) but filter off the deferred
  // value, so typing stays responsive.
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    return requestees.filter((r) => {
      if (filter === "awaiting" && !r.cases.some(isAwaitingReview)) return false;
      if (filter === "no_cases" && r.cases.some(isLive)) return false;
      if (filter === "unsigned" && r.agreed_at) return false;

      if (!q) return true;

      return (
        (r.name ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        r.cases.some((c) => c.title.toLowerCase().includes(q))
      );
    });
  }, [requestees, deferredQuery, filter]);

  function toggleRow(userId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* ── TOOLBAR: SEARCH + FILTER ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search by name, email, case title…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9 h-9 text-sm bg-white"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filter requestees"
        >
          <option value="all">All requestees</option>
          <option value="awaiting">Has cases awaiting review</option>
          <option value="no_cases">No cases yet</option>
          <option value="unsigned">Agreement not signed</option>
        </select>
      </div>

      {/* ── RESULT COUNT ── */}
      {(query || filter !== "all") && (
        <p className="text-xs text-muted-foreground">
          {filtered.length === 0
            ? "No requestees found."
            : `Showing ${filtered.length} of ${requestees.length} requestees`}
        </p>
      )}

      {/* ── TABLE ── */}
      <Card className="border-muted/60 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-muted/30">
                <TableHead className="pl-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Agreement
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Cases
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Last Case
                </TableHead>
                <TableHead className="pr-6 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Joined
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {requestees.length === 0 ? "No requestees have signed up yet." : "No requestees found."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r) => {
                  const isOpen = expanded.has(r.user_id);
                  const liveCases = r.cases.filter(isLive);
                  const awaiting = r.cases.filter(isAwaitingReview).length;

                  return (
                    <Fragment key={r.user_id}>
                      <TableRow className="hover:bg-muted/40 transition-colors">
                        <TableCell className="pl-6 py-4 font-medium text-foreground">
                          <button
                            onClick={() => toggleRow(r.user_id)}
                            aria-expanded={isOpen}
                            className="inline-flex items-center gap-1.5 text-left hover:text-primary transition-colors"
                          >
                            <ChevronRight
                              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                                isOpen ? "rotate-90" : ""
                              }`}
                            />
                            {r.name ?? (
                              <span className="italic font-normal text-muted-foreground">
                                Name not provided
                              </span>
                            )}
                          </button>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-muted-foreground">
                          {r.email ? (
                            <a href={`mailto:${r.email}`} className="hover:text-foreground hover:underline">
                              {r.email}
                            </a>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-sm">
                          {r.agreed_at ? (
                            <span className={`${BADGE} bg-green-400/10 text-green-600 ring-green-400/20`}>
                              Signed {fmtDate(r.agreed_at)}
                            </span>
                          ) : (
                            <span className={`${BADGE} bg-amber-400/10 text-amber-700 ring-amber-400/30`}>
                              Not signed
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{liveCases.length}</span>
                            {awaiting > 0 && (
                              <span className={`${BADGE} bg-amber-400/10 text-amber-700 ring-amber-400/30`}>
                                {awaiting} awaiting review
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 text-sm text-muted-foreground">
                          {fmtDate(liveCases[0]?.created_at)}
                        </TableCell>
                        <TableCell className="pr-6 py-4 text-sm text-muted-foreground">
                          {fmtDate(r.joined_at)}
                        </TableCell>
                      </TableRow>

                      {isOpen && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell colSpan={6} className="px-6 py-4">
                            {r.cases.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No cases submitted yet.</p>
                            ) : (
                              <ul className="divide-y rounded-lg border bg-white">
                                {r.cases.map((c) => {
                                  const badge = caseBadge(c);
                                  return (
                                    <li
                                      key={c.id}
                                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5"
                                    >
                                      <Link
                                        href={`/dashboard/Admin/${c.id}`}
                                        className="min-w-0 text-sm font-medium text-primary hover:text-primary/80 hover:underline"
                                      >
                                        {c.title}
                                      </Link>
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs text-muted-foreground">
                                          {fmtDate(c.created_at)}
                                        </span>
                                        <span className={`${BADGE} ${badge.className}`}>{badge.label}</span>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
