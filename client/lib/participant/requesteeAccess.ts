import { supabaseAdmin } from "@/lib/supabase/admin";
import { calcAgeFromDob } from "@/lib/filter-utils";
import { isWaitlisted } from "@/lib/participant/waitlist";

/**
 * The only way participant data reaches a law firm (requestee) in the app.
 *
 * The database gives requestee logins no read access to jury_participants or
 * oldData at all (supabase/migrations/20261002_requestee_no_participant_access.sql),
 * so every requestee screen goes through these helpers. They run with the
 * service-role client, so each one checks first that the participant is on a
 * case the caller owns, then hands back only the fields below. Keep them in
 * step with privacy policy section 6 (client/app/privacy/page.tsx).
 *
 * Never returned: email, phone, street address, zip, date of birth (only the
 * age), ID number or image, PayPal username, availability, admin flags.
 *
 * Deliberately not a "use server" module: these functions trust the case and
 * participant ids they're given, so the browser must not be able to call them.
 * Callers prove who the user is first.
 */
export const REQUESTEE_PROFILE_FIELDS = [
  "first_name",
  "last_name",
  "city",
  "state",
  "gender",
  "race",
  "marital_status",
  "has_children",
  "us_citizen",
  "served_on_jury",
  "convicted_felon",
  "education_level",
  "family_income",
  "currently_employed",
  "served_armed_forces",
  "political_affiliation",
] as const;

type ProfileField = (typeof REQUESTEE_PROFILE_FIELDS)[number];
export type RequesteeParticipantProfile = Record<ProfileField, string | null> & {
  age: number | null;
};

/** The search result a firm sees when adding people to its own session. */
export type RequesteeSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  age: number | null;
  political_affiliation: string | null;
};

type Row = Record<string, unknown>;

const text = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

/** Age from jury_participants.date_of_birth, or oldData's dob / age columns. */
export function ageOf(row: Row): number | null {
  const dob = row.date_of_birth ?? row.dob;
  if (typeof dob === "string" && dob) {
    const age = calcAgeFromDob(dob);
    return Number.isFinite(age) ? age : null;
  }
  const stored = typeof row.age === "number" ? row.age : Number(row.age);
  return row.age != null && Number.isFinite(stored) ? stored : null;
}

export function toRequesteeProfile(row: Row): RequesteeParticipantProfile {
  const out = { age: ageOf(row) } as RequesteeParticipantProfile;
  for (const field of REQUESTEE_PROFILE_FIELDS) out[field] = text(row[field]);
  return out;
}

export function toRequesteeSearchResult(row: Row): RequesteeSearchResult {
  return {
    id: String(row.user_id || row.id),
    first_name: text(row.first_name),
    last_name: text(row.last_name),
    city: text(row.city),
    age: ageOf(row),
    political_affiliation: text(row.political_affiliation),
  };
}

/** True when the user created, or is the assigned requestee on, every one of the cases. */
export async function ownsAllCases(userId: string, caseIds: string[]): Promise<boolean> {
  const wanted = Array.from(new Set(caseIds));
  if (wanted.length === 0) return false;
  const { data, error } = await supabaseAdmin
    .from("cases")
    .select("id, user_id, requestee_id")
    .in("id", wanted);
  if (error) throw new Error(`cases lookup: ${error.message}`);
  const owned = new Set(
    (data ?? [])
      .filter((c) => c.user_id === userId || c.requestee_id === userId)
      .map((c) => c.id as string)
  );
  return wanted.every((id) => owned.has(id));
}

/**
 * Everyone on the given cases' sessions, as session_participants.participant_id.
 * Waitlisters are left out: the reserve list is not shown to the firm until
 * someone is called in, which makes them 'accepted'.
 */
export async function caseParticipantIds(caseIds: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  if (caseIds.length === 0) return ids;

  const { data: links, error: linkError } = await supabaseAdmin
    .from("session_cases")
    .select("session_id")
    .in("case_id", caseIds);
  if (linkError) throw new Error(`session_cases lookup: ${linkError.message}`);

  const sessionIds = Array.from(new Set((links ?? []).map((l) => l.session_id as string)));
  if (sessionIds.length === 0) return ids;

  const { data: seats, error: seatError } = await supabaseAdmin
    .from("session_participants")
    .select("participant_id, invite_status")
    .in("session_id", sessionIds);
  if (seatError) throw new Error(`session_participants lookup: ${seatError.message}`);

  for (const seat of seats ?? []) {
    if (!isWaitlisted(seat.invite_status as string | null)) ids.add(seat.participant_id as string);
  }
  return ids;
}

/**
 * Full participant rows keyed by session_participants.participant_id: a
 * jury_participants.user_id, or an oldData id for legacy participants. They
 * stay on the server; callers pass them through toRequesteeProfile.
 */
async function loadParticipantRows(ids: string[]): Promise<Map<string, Row>> {
  const rows = new Map<string, Row>();
  if (ids.length === 0) return rows;

  const { data: jury, error: juryError } = await supabaseAdmin
    .from("jury_participants")
    .select("*")
    .in("user_id", ids);
  if (juryError) throw new Error(`jury_participants lookup: ${juryError.message}`);
  for (const row of (jury ?? []) as Row[]) rows.set(String(row.user_id), row);

  const missing = ids.filter((id) => !rows.has(id));
  if (missing.length > 0) {
    const { data: legacy, error: legacyError } = await supabaseAdmin
      .from("oldData")
      .select("*")
      .in("id", missing);
    if (legacyError) throw new Error(`oldData lookup: ${legacyError.message}`);
    for (const row of (legacy ?? []) as Row[]) rows.set(String(row.id), row);
  }
  return rows;
}

/**
 * First and last names of the requested participants who are on the given
 * cases. Anyone not on those cases is silently left out. The caller must have
 * checked that it owns every case in `caseIds`.
 */
export async function participantNamesForCases(
  caseIds: string[],
  participantIds: string[]
): Promise<Record<string, { first_name: string | null; last_name: string | null }>> {
  const onCases = await caseParticipantIds(caseIds);
  const wanted = Array.from(new Set(participantIds)).filter((id) => onCases.has(id));
  const rows = await loadParticipantRows(wanted);

  const names: Record<string, { first_name: string | null; last_name: string | null }> = {};
  for (const [id, row] of rows) {
    names[id] = { first_name: text(row.first_name), last_name: text(row.last_name) };
  }
  return names;
}

/**
 * The profile a firm may see for one participant on one of its cases, or null
 * when the participant isn't on that case. The caller must have checked that it
 * owns `caseId`.
 */
export async function requesteeParticipantProfile(
  caseId: string,
  participantId: string
): Promise<RequesteeParticipantProfile | null> {
  const onCase = await caseParticipantIds([caseId]);
  if (!onCase.has(participantId)) return null;
  const row = (await loadParticipantRows([participantId])).get(participantId);
  return row ? toRequesteeProfile(row) : null;
}
