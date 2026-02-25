import { getParticipantProfile } from "@/lib/participant/getParticipantProfile";
import { createClient } from "@/lib/supabase/server";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";
import AdminParticipantControls from "@/components/AdminParticipantControls";

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
          <Link
            href={`/dashboard/Admin/${schParams?.caseId}${isOldData ? "?test_table=oldData" : ""}`}
            className="text-blue-600 underline"
          >
            ← Back to Case
          </Link>
        )}

        {/* HEADER */}
        <div className="bg-white border rounded-xl p-6 shadow-sm">
          <h1 className="text-3xl font-bold">
            {participant.first_name} {participant.last_name}
          </h1>
          <p className="text-slate-500 mt-1">
            {participant.city}, {participant.state}
          </p>
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
            <p>Age: {participant.age}</p>
            <p>Gender: {participant.gender}</p>
            <p>Race: {participant.race}</p>
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
            <p>Internet Access: {participant.internet_access}</p>
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
        {(participant.driver_license_number || participant.driver_license_image_url) && (
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

        {/* ADMIN AREA */}
        {role === "admin" && (
          <section className="bg-slate-50 border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-4">Admin Controls</h2>
            <AdminParticipantControls
              userId={participant.user_id}
              approvedByAdmin={participant.approved_by_admin ?? null}
              blacklistedAt={participant.blacklisted_at ?? null}
            />
          </section>
        )}
      </div>
    );
  } catch (err: any) {
    return (
      <p className="text-center text-red-500 mt-20">
        {err.message || "Something went wrong"}
      </p>
    );
  }
}