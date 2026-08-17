import { getParticipantProfile } from "@/lib/participant/getParticipantProfile";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import BackButton from "@/components/BackButton";
import AdminParticipantControls from "@/components/AdminParticipantControls";
import ParticipantSessionHistory from "@/components/ParticipantSessionHistory";
import { BACKOUT_FLAG_LIMIT } from "@/lib/actions/participantFlags";

const fmtDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export default async function ParticipantProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ participantId: string }>;
  searchParams?: Promise<{ from?: string; caseId?: string; test_table?: string }>;
}) {
  try {
    /* =========================
       UNWRAP ASYNC PARAMS
       ========================= */
    const { participantId } = await params;
    const schParams = searchParams ? await searchParams : undefined;
    const isOldData = schParams?.test_table === "oldData";
    const testTable = isOldData ? "oldData" : "jury_participants";

    const { participant, role } = await getParticipantProfile(
      participantId,
      {
        from: schParams?.from,
        caseId: schParams?.caseId,
        testTable: testTable,
      }
    );
    const fromCase =
      schParams?.from === "case" && schParams?.caseId;

    return (
      <div className="max-w-5xl mx-auto p-8 space-y-8">
        {/* BACK LINK */}
        {fromCase && role !== "participant" && (
          <BackButton
            href={
              role === "requestee"
                ? `/dashboard/requestee/${schParams?.caseId}`
                : `/dashboard/Admin/${schParams?.caseId}${isOldData ? "?test_table=oldData" : ""}`
            }
            label="Back to Case"
          />
        )}

        {/* HEADER */}
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h1 className="text-3xl font-bold">
            {participant.first_name} {participant.last_name}
          </h1>
          <p className="text-slate-500 mt-1">
            {participant.city}, {participant.state}
          </p>
          {/* Contact details are PII — requestees see the profile without them. */}
          {role !== "requestee" && (
            <p className="mt-2 text-sm text-slate-600">
              {participant.email ? (
                <a
                  href={`mailto:${participant.email}`}
                  className="text-blue-600 hover:underline"
                >
                  {participant.email}
                </a>
              ) : (
                <span className="text-slate-400">No email on file</span>
              )}
            </p>
          )}
        </div>

        {/* PARTICIPANT DASHBOARD BUTTON */}
        {role === "participant" && (
          <div>
            <Link
              href="/dashboard/participant"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Go to My Dashboard
            </Link>
          </div>
        )}

        {/* DEMOGRAPHICS */}
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Demographics</h2>
          <div className="grid grid-cols-2 gap-3">
            <p>Gender: {participant.gender}</p>
            <p>Race: {participant.race}</p>
            {participant.date_of_birth && (
              <p>Age: {(() => {
                const b = new Date(participant.date_of_birth);
                const t = new Date();
                let a = t.getFullYear() - b.getFullYear();
                const m = t.getMonth() - b.getMonth();
                if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
                return a;
              })()}</p>
            )}
            <p>Marital Status: {participant.marital_status}</p>
            <p>Has Children: {participant.has_children}</p>
          </div>
        </section>

        {/* CIVIC */}
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Civic / Legal</h2>
          <div className="grid grid-cols-2 gap-3">
            <p>U.S. Citizen: {participant.us_citizen}</p>
            <p>Served on Jury: {participant.served_on_jury}</p>
            <p>Convicted Felon: {participant.convicted_felon}</p>
          </div>
        </section>

        {/* SOCIOECONOMIC */}
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Socioeconomic</h2>
          <div className="grid grid-cols-2 gap-3">
            <p>Education: {participant.education_level}</p>
            <p>Family Income: {participant.family_income}</p>
            <p>Currently Employed: {participant.currently_employed}</p>
          </div>
        </section>

        {/* BACKGROUND */}
        <section className="bg-white border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">Background</h2>
          <div className="grid grid-cols-2 gap-3">
            <p>Armed Forces: {participant.served_armed_forces}</p>
            <p>Political Affiliation: {participant.political_affiliation}</p>
          </div>
        </section>

        {/* IDENTIFICATION */}
        {role !== "requestee" && (participant.driver_license_number || participant.driver_license_image_url) && (
          <section className="bg-white border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Identification</h2>
            <div className="grid grid-cols-2 gap-3">
              <p>Driver&apos;s License / ID #: {participant.driver_license_number || "\u2014"}</p>
              {participant.driver_license_image_url && (async () => {
                const supabase = await createClient();
                const { data: signedData } = await supabase.storage
                  .from("id-documents")
                  .createSignedUrl(participant.driver_license_image_url, 3600);
                const signedUrl = signedData?.signedUrl;
                if (!signedUrl) return <p className="text-sm text-slate-400">Unable to load ID image</p>;
                return (
                  <div>
                    <p className="mb-2">ID Photo:</p>
                    <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={signedUrl}
                        alt="Driver's License / ID"
                        className="max-h-40 rounded-lg border object-contain hover:opacity-80 transition-opacity"
                      />
                    </a>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* PAYMENT INFO */}
        {role !== "requestee" && (
          <section className="bg-white border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Payment Information</h2>
            <p>PayPal: {participant.paypal_username ? `@${participant.paypal_username}` : "—"}</p>
          </section>
        )}

        {/* SESSION HISTORY — admin only (crosses case boundaries) */}
        {role === "admin" && (
          <ParticipantSessionHistory
            participantIds={[participant.user_id, participant.id].filter(Boolean)}
          />
        )}

        {/* ACCOUNT & ACTIVITY — admin only */}
        {role === "admin" && (() => {
          const strikes = participant.flag_count ?? 0;
          const cooldownUntil = participant.eligible_after_at
            ? new Date(participant.eligible_after_at)
            : null;
          const onCooldown = !!cooldownUntil && cooldownUntil > new Date();

          // Mirror the gate `updateInviteStatus` actually enforces when a
          // participant tries to accept. NOT `profile_completed` — nothing in the
          // app ever writes that column, so it reads false for everyone.
          const missingForInvite: string[] = [];
          if (!participant.driver_license_number || !participant.driver_license_image_url) {
            missingForInvite.push("ID");
          }
          if (!participant.paypal_username) missingForInvite.push("PayPal");

          return (
            <section className="bg-white border rounded-xl p-6 space-y-4">
              <h2 className="font-bold text-lg">Account &amp; Activity</h2>

              {/* Flags that change who can be invited */}
              <div className="flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    strikes > 0
                      ? "bg-orange-400/10 text-orange-600 ring-orange-400/20"
                      : "bg-slate-400/10 text-slate-600 ring-slate-400/20"
                  }`}
                  title="Strikes for no-shows / back-outs. 3 strikes auto-blacklists."
                >
                  Strikes: {strikes} / {BACKOUT_FLAG_LIMIT}
                </span>

                {onCooldown && (
                  <span
                    className="inline-flex items-center rounded-full bg-blue-400/10 px-2.5 py-1 text-xs font-medium text-blue-600 ring-1 ring-inset ring-blue-400/20"
                    title="Set after accepting a session — they are skipped by invite selection until this date."
                  >
                    On cooldown until {fmtDate(participant.eligible_after_at)}
                  </span>
                )}

                {missingForInvite.length > 0 && (
                  <span
                    className="inline-flex items-center rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-400/30"
                    title="They can be invited, but cannot accept until these are on file — enforced in updateInviteStatus."
                  >
                    Can&apos;t accept invites — missing {missingForInvite.join(" + ")}
                  </span>
                )}

                {participant.reactivation_status && (
                  <span className="inline-flex items-center rounded-full bg-slate-400/10 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-400/20">
                    Reactivation: {participant.reactivation_status}
                  </span>
                )}
              </div>

              {participant.blacklisted_at && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-700">
                    Blacklisted {fmtDate(participant.blacklisted_at)}
                  </p>
                  <p className="text-sm text-red-600 mt-0.5">
                    {participant.blacklist_reason || "No reason recorded"}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <p>Phone: {participant.phone || "—"}</p>
                <p>County: {participant.county || "—"}</p>
                <p>
                  Address:{" "}
                  {[
                    participant.street_address,
                    participant.address_line_2,
                    participant.city,
                    participant.state,
                    participant.zip_code,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </p>
                <p>
                  Availability: Weekdays {participant.availability_weekdays || "—"} · Weekends{" "}
                  {participant.availability_weekends || "—"}
                </p>
                <p>Industry: {participant.industry || "—"}</p>
                <p>Heard About Us: {participant.heard_about_us || "—"}</p>
                <p>Registered: {fmtDate(participant.entry_date)}</p>
                <p>Profile Updated: {fmtDate(participant.date_updated)}</p>
              </div>
            </section>
          );
        })()}

        {/* ADMIN AREA */}
        {role === "admin" && (
          <section className="bg-slate-50 border rounded-xl p-6 space-y-4">
            <h2 className="font-bold text-lg">Admin Controls</h2>
            <AdminParticipantControls
              userId={participant.user_id}
              approvedByAdmin={participant.approved_by_admin ?? null}
              blacklistedAt={participant.blacklisted_at ?? null}
            />
            <div className="pt-2 border-t border-slate-200">
              <div className="relative group inline-flex items-start">
                <Link
                  href={`/dashboard/Admin/participants/${participant.user_id}/edit`}
                  className="inline-flex items-center rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 transition-colors"
                >
                  Edit Participant Details
                </Link>
                <span className="ml-1 -mt-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[11px] font-bold cursor-default select-none leading-none">?</span>
                <div className="absolute bottom-full left-0 mb-2 w-60 rounded-md bg-slate-800 px-3 py-2 text-xs text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  Saving changes will send an email notification to the participant listing what was updated.
                  <span className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    return (
      <p className="text-center text-red-500 mt-20">
        {msg}
      </p>
    );
  }
}