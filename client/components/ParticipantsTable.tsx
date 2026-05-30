"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Search, X, Mail } from "lucide-react";
import { unblacklistParticipant } from "@/lib/actions/adminParticipant";

const MAX_SELECTION = 500;

function calcAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

type Participant = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  gender: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  date_of_birth: string | null;
  entry_date: string | null;
  blacklist_reason: string | null;
  blacklisted_at: string | null;
  approved_by_admin: boolean | null;
  idSignedUrl: string | null;
  reactivation_status: "pending" | "yes" | "no" | null;
  reactivation_email_sent_at: string | null;
  reactivation_confirmed_at: string | null;
  [key: string]: unknown;
};

type Props = {
  participants: Participant[];
  tab: "approved" | "blacklisted";
};

type StatusFilter = "all" | "yes" | "no" | "pending";

export default function ParticipantsTable({ participants, tab }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return participants.filter((p) => {
      // NULL status is rendered as "pending" in the table — match that here.
      const status = p.reactivation_status ?? "pending";
      if (statusFilter !== "all" && status !== statusFilter) return false;

      if (!q) return true;

      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const location = `${p.city ?? ""} ${p.state ?? ""}`.toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      const gender = (p.gender ?? "").toLowerCase();
      return (
        name.includes(q) ||
        email.includes(q) ||
        location.includes(q) ||
        phone.includes(q) ||
        gender.includes(q)
      );
    });
  }, [participants, query, statusFilter]);

  const filteredIds = useMemo(() => filtered.map((p) => p.user_id), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someFilteredSelected =
    !allFilteredSelected && filteredIds.some((id) => selected.has(id));

  function handleUnblacklist(userId: string) {
    setPendingId(userId);
    startTransition(async () => {
      await unblacklistParticipant(userId);
      setPendingId(null);
    });
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelected(new Set());
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggleRow(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function handleContinue() {
    if (selected.size === 0) return;
    if (selected.size > MAX_SELECTION) {
      alert(
        `You selected ${selected.size} participants. Please send in batches of ${MAX_SELECTION} or fewer.`
      );
      return;
    }
    const ids = Array.from(selected).join(",");
    router.push(`/dashboard/Admin/participants/send-mail?ids=${ids}`);
  }

  const showSendMail = tab === "approved";

  return (
    <div className="space-y-4">
      {/* ── TOOLBAR: SEARCH + STATUS FILTER + SEND MAIL ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative max-w-sm flex-1">
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

          {tab === "approved" && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by active status"
            >
              <option value="all">All status</option>
              <option value="yes">Active: Yes</option>
              <option value="no">Active: No</option>
              <option value="pending">Active: Pending</option>
            </select>
          )}
        </div>

        {showSendMail && (
          <div className="flex items-center gap-2">
            {selectMode ? (
              <>
                <span className="text-sm text-muted-foreground">
                  {selected.size} selected
                </span>
                <button
                  onClick={cancelSelectMode}
                  className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={selected.size === 0}
                  className="inline-flex items-center rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Continue ({selected.size})
                </button>
              </>
            ) : (
              <button
                onClick={enterSelectMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-green-600 bg-white px-3 py-1.5 text-sm font-medium text-green-700 shadow-sm hover:bg-green-50 transition-colors"
              >
                <Mail className="h-4 w-4" />
                Send Mail
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── RESULT COUNT ── */}
      {(query || statusFilter !== "all") && (
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
                {selectMode && (
                  <TableHead className="pl-6 w-10">
                    <Checkbox
                      checked={
                        allFilteredSelected
                          ? true
                          : someFilteredSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleSelectAllFiltered}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead
                  className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground ${selectMode ? "" : "pl-6"}`}
                >
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
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active
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
                const isSelected = selected.has(p.user_id);
                const status = p.reactivation_status ?? "pending";

                return (
                  <TableRow
                    key={p.user_id}
                    data-state={isSelected ? "selected" : undefined}
                    className="group hover:bg-muted/40 transition-colors data-[state=selected]:bg-green-50/60"
                  >
                    {selectMode && (
                      <TableCell className="pl-6 py-4 w-10">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleRow(p.user_id)}
                          aria-label={`Select ${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()}
                        />
                      </TableCell>
                    )}
                    <TableCell
                      className={`font-medium text-foreground py-4 ${selectMode ? "" : "pl-6"}`}
                    >
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
                      {p.date_of_birth ? calcAge(p.date_of_birth) : "—"}
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
                    <TableCell className="py-4 text-sm">
                      {status === "yes" ? (
                        <span className="inline-flex items-center rounded-full bg-green-400/10 px-2 py-1 text-xs font-medium text-green-600 ring-1 ring-inset ring-green-400/20">
                          Yes
                        </span>
                      ) : status === "no" ? (
                        <span className="inline-flex items-center rounded-full bg-red-400/10 px-2 py-1 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-400/20">
                          No
                        </span>
                      ) : p.reactivation_email_sent_at ? (
                        <span
                          className="inline-flex items-center rounded-full bg-blue-400/10 px-2 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-400/30"
                          title="Reactivation email sent — awaiting response"
                        >
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-400/10 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-400/30">
                          Pending
                        </span>
                      )}
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
                          <Link
                            href={`/dashboard/Admin/participants/${p.user_id}/edit`}
                            className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-200 transition-colors"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => handleUnblacklist(p.user_id)}
                            disabled={isThisPending}
                            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isThisPending ? "Moving…" : "Unblacklist"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <span className="inline-flex items-center rounded-full bg-green-400/10 px-2 py-1 text-xs font-medium text-green-500 ring-1 ring-inset ring-green-400/20">
                            Verified
                          </span>
                          <Link
                            href={`/dashboard/Admin/participants/${p.user_id}/edit`}
                            className="inline-flex items-center rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-200 transition-colors"
                          >
                            Edit
                          </Link>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}

              {!filtered.length && (
                <TableRow>
                  <TableCell
                    colSpan={selectMode ? 10 : 9}
                    className="text-center py-16 text-muted-foreground italic"
                  >
                    {query
                      ? `No results for "${query}"`
                      : statusFilter !== "all"
                      ? `No participants with status "${statusFilter}".`
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
