"use client";

import { useState, useMemo, useTransition } from "react";
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
import Link from "next/link";
import { Search, X } from "lucide-react";
import { unblacklistParticipant } from "@/lib/actions/adminParticipant";

type Participant = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  entry_date: string | null;
  blacklist_reason: string | null;
  blacklisted_at: string | null;
  approved_by_admin: boolean | null;
  idSignedUrl: string | null;
  [key: string]: unknown;
};

type Props = {
  participants: Participant[];
  tab: "approved" | "blacklisted";
};

export default function ParticipantsTable({ participants, tab }: Props) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return participants;

    return participants.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const location = `${p.city ?? ""} ${p.state ?? ""}`.toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      const gender = (p.gender ?? "").toLowerCase();
      const age = String(p.age ?? "");

      return (
        name.includes(q) ||
        email.includes(q) ||
        location.includes(q) ||
        phone.includes(q) ||
        gender.includes(q) ||
        age.includes(q)
      );
    });
  }, [participants, query]);

  function handleUnblacklist(userId: string) {
    setPendingId(userId);
    startTransition(async () => {
      await unblacklistParticipant(userId);
      setPendingId(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* ── SEARCH BAR ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search by name, email, location…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm bg-white"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── RESULT COUNT ── */}
      {query && (
        <p className="text-xs text-muted-foreground">
          {filtered.length === 0
            ? "No participants found."
            : `Showing ${filtered.length} of ${participants.length} participants`}
        </p>
      )}

      {/* ── TABLE ── */}
      <Card className="border-muted/60 shadow-md">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-6">
                  Name
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Email
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Age
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Gender
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Location
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Phone
                </TableHead>
                {tab === "blacklisted" ? (
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reason
                  </TableHead>
                ) : (
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Registered
                  </TableHead>
                )}
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground pr-6">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {filtered.map((p) => {
                const regDate = p.entry_date
                  ? new Date(p.entry_date).toLocaleDateString()
                  : "—";
                const isThisPending = isPending && pendingId === p.user_id;

                return (
                  <TableRow
                    key={p.user_id}
                    className="group hover:bg-muted/40 transition-colors"
                  >
                    <TableCell className="font-medium text-foreground py-4 pl-6">
                      <Link
                        href={`/dashboard/participant/${p.user_id}`}
                        className="text-primary hover:text-primary/80 hover:underline"
                      >
                        {p.first_name} {p.last_name}
                      </Link>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">
                      {p.email || "—"}
                    </TableCell>
                    <TableCell className="py-4 text-sm">
                      {p.age || "—"}
                    </TableCell>
                    <TableCell className="py-4 text-sm capitalize">
                      {p.gender || "—"}
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">
                      {[p.city, p.state].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">
                      {p.phone || "—"}
                    </TableCell>
                    {tab === "blacklisted" ? (
                      <TableCell
                        className="py-4 text-sm text-red-600 max-w-[200px] truncate"
                        title={p.blacklist_reason || ""}
                      >
                        {p.blacklist_reason || "—"}
                      </TableCell>
                    ) : (
                      <TableCell className="py-4 text-sm text-muted-foreground">
                        {regDate}
                      </TableCell>
                    )}

                    {/* ── ACTIONS ── */}
                    <TableCell className="text-right py-4 pr-6">
                      {tab === "blacklisted" ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-400/20">
                            Blacklisted
                          </span>
                          <button
                            onClick={() => handleUnblacklist(p.user_id)}
                            disabled={isThisPending}
                            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isThisPending ? "Moving…" : "Unblacklist"}
                          </button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-green-400/10 px-2 py-1 text-xs font-medium text-green-500 ring-1 ring-inset ring-green-400/20">
                          Verified
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!filtered.length && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-16 text-muted-foreground italic"
                  >
                    {query
                      ? `No results for "${query}"`
                      : tab === "blacklisted"
                      ? "No blacklisted participants."
                      : "No approved participants yet."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
