import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sendReactivationEmails } from "@/lib/actions/adminParticipant";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SELECTION = 500;

async function confirmAction(formData: FormData) {
  "use server";
  const raw = String(formData.get("ids") || "");
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s))
    .slice(0, MAX_SELECTION);

  if (ids.length === 0) {
    redirect("/dashboard/Admin/participants");
  }

  const result = await sendReactivationEmails(ids);
  redirect(
    `/dashboard/Admin/participants?sent=${result.sent}${result.failed ? `&failed=${result.failed}` : ""}`
  );
}

export default async function SendMailConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const idList = (params.ids || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  if (idList.length === 0) {
    redirect("/dashboard/Admin/participants");
  }

  const { data: rows } = await supabaseAdmin
    .from("jury_participants")
    .select("user_id, first_name, last_name, email, reactivation_email_sent_at, reactivation_status")
    .in("user_id", idList)
    .eq("approved_by_admin", true)
    .is("blacklisted_at", null)
    .order("first_name", { ascending: true });

  const recipients = rows ?? [];
  const idsForForm = recipients.map((r) => r.user_id).join(",");
  const tooMany = idList.length > MAX_SELECTION;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Confirm reactivation email</h2>
          <p className="text-muted-foreground mt-1">
            Review the recipients and email preview before sending.
          </p>
        </div>
        <Link
          href="/dashboard/Admin/participants"
          className="text-sm underline text-muted-foreground hover:text-foreground"
        >
          &larr; Back to Participants
        </Link>
      </div>

      {tooMany && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You selected {idList.length} participants. Only the first {MAX_SELECTION} will be
          sent in this batch.
        </div>
      )}

      {idList.length !== recipients.length && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {idList.length - recipients.length} of your selected rows are no longer eligible
          (unapproved or blacklisted) and will be skipped.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── EMAIL PREVIEW ── */}
        <Card className="border-muted/60 shadow-md">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className="text-sm font-medium mt-1">
                Texas Jury Study has launched &mdash; are you still interested?
              </p>
            </div>
            <div className="border-t pt-4 text-sm text-slate-700 leading-relaxed space-y-3">
              <p className="font-semibold text-slate-900">Are you still interested?</p>
              <p>
                <strong>Texas Jury Study has launched a new website.</strong> You
                previously signed up to participate in our paid focus groups, and we are
                reaching out to confirm you would still like to be part of the panel.
              </p>
              <p>
                Click the button below to confirm. Afterwards you will be asked to upload
                a valid Texas ID and confirm your PayPal account so we can send you
                payment for future sessions.
              </p>
              <div className="flex justify-center py-3">
                <span className="inline-flex items-center rounded-lg bg-green-600 px-7 py-3 text-sm font-bold text-white shadow">
                  Yes, I&rsquo;m still interested
                </span>
              </div>
              <p className="text-xs text-slate-500">
                If you no longer wish to participate, simply ignore this email. You have
                30 days to respond.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ── RECIPIENT LIST ── */}
        <Card className="border-muted/60 shadow-md">
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b">
              <p className="text-sm font-semibold">
                Recipients ({recipients.length})
              </p>
            </div>
            <div className="max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader className="bg-muted/30 sticky top-0">
                  <TableRow>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pl-6">
                      Name
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Email
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pr-6">
                      Notes
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.user_id}>
                      <TableCell className="py-3 pl-6 text-sm font-medium">
                        {r.first_name} {r.last_name}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-muted-foreground">
                        {r.email || "—"}
                      </TableCell>
                      <TableCell className="py-3 pr-6 text-xs text-muted-foreground">
                        {r.reactivation_status === "yes"
                          ? "Already confirmed"
                          : r.reactivation_status === "no"
                            ? "Previously opted out"
                            : r.reactivation_email_sent_at
                              ? `Re-send (last: ${new Date(r.reactivation_email_sent_at).toLocaleDateString()})`
                              : "First send"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {recipients.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-12 text-center text-sm text-muted-foreground italic">
                        No eligible recipients in this selection.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── ACTIONS ── */}
      <form action={confirmAction} className="flex items-center justify-end gap-3 pt-2">
        <input type="hidden" name="ids" value={idsForForm} />
        <Link
          href="/dashboard/Admin/participants"
          className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={recipients.length === 0}
          className="inline-flex items-center rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Confirm and Send ({recipients.length})
        </button>
      </form>
    </div>
  );
}
