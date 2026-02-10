import { getParticipantProfile } from "@/lib/participant/getParticipantProfile";
import ParticipantForm from "@/components/ParticipantForm";
import Link from "next/link";

export default async function ParticipantProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ participantId: string }>;
  searchParams?: Promise<{ from?: string; caseId?: string }>;
}) {
  try {
    /* =========================
       UNWRAP ASYNC PARAMS
       ========================= */
    const { participantId } = await params;
    const sp = searchParams ? await searchParams : undefined;

    const { participant, role } = await getParticipantProfile(participantId, {
      from: sp?.from,
      caseId: sp?.caseId,
    });

    /* =========================
       🟢 NEW USER → SHOW FORM
       ========================= */
    if (role === "participant" && !participant) {
      return <ParticipantForm userId={participantId} />;
    }

    return (
      <div className="max-w-5xl mx-auto p-8 space-y-8">
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

        {/* ADMIN AREA */}
        {role !== "participant" && (
          <section className="bg-slate-50 border rounded-xl p-6">
            <h2 className="font-bold text-lg mb-2">Admin / Presenter Area</h2>
            <p className="text-slate-500 text-sm">
              Actions will appear here later.
            </p>
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