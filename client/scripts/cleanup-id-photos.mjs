/**
 * Finds ID photos in the "id-documents" bucket that no participant profile points at,
 * and deletes them once you've checked the list. These are copies of people's IDs:
 * photos replaced by a newer upload, uploads from signups that never finished, and
 * photos of accounts that were deleted by hand (deleting a user in the Supabase
 * dashboard leaves their files behind).
 *
 * Kept, never deleted: anything uploaded in the last 24 hours (a signup may be mid-save),
 * anything not inside a "<user id>/" folder, and anything in the folder of a legacy
 * participant from "oldData".
 *
 * Run from client/:
 *   node scripts/cleanup-id-photos.mjs                        list only, deletes nothing
 *   node scripts/cleanup-id-photos.mjs --delete --expect=71   delete, if the count still matches
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 * (or the file named by ENV_FILE).
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "id-documents";
const PAGE = 1000;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DELETABLE = {
  replaced: "replaced or retried (participant has a newer photo)",
  unfinished: "has a login but never finished signup",
  deletedAccount: "account no longer exists",
  unknownLogin: "no participant profile (couldn't check the login)",
};
const KEPT = {
  recent: "uploaded in the last 24 hours",
  outsideFolder: "not inside a user folder",
  legacy: "legacy participant (oldData)",
  oddLink: "named inside a participant link that isn't a plain file path",
};

// Load .env.local manually, like scripts/upload-videos.ts.
const envPath = process.env.ENV_FILE ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env.local");
for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  if (!process.env[key]) process.env[key] = trimmed.slice(eqIdx + 1).trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envPath}`);
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const expected = Number(args.find((arg) => arg.startsWith("--expect="))?.split("=")[1]);

// Pages stop only when one comes back empty, so a server-side cap below PAGE can't end
// a listing early and make a linked photo look unlinked.
async function listFolder(prefix) {
  const entries = [];
  for (;;) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset: entries.length, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    if (data.length === 0) return entries;
    entries.push(...data);
  }
}

async function listAllFiles() {
  const files = [];
  for (const entry of await listFolder("")) {
    // A null id is a folder; this bucket only nests one level deep.
    if (entry.id !== null) {
      files.push({ path: entry.name, folder: "", size: entry.metadata?.size ?? 0, createdAt: entry.created_at });
      continue;
    }
    for (const file of await listFolder(entry.name)) {
      if (file.id === null) continue;
      files.push({
        path: `${entry.name}/${file.name}`,
        folder: entry.name,
        size: file.metadata?.size ?? 0,
        createdAt: file.created_at,
      });
    }
  }
  return files;
}

// Ordered by a unique column, so a row updated mid-read can't move between pages and be
// skipped (which would make its photo look unlinked).
async function selectAll(table, columns, orderBy) {
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy)
      .range(rows.length, rows.length + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data.length === 0) return rows;
    rows.push(...data);
  }
}

// listUsers fails on this project ("Database error finding users"), so look up only the
// folders that need it, one login at a time.
async function loginStatus(userIds) {
  const status = new Map();
  for (const id of userIds) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    status.set(id, data?.user ? "exists" : error?.status === 404 ? "missing" : "unknown");
  }
  return status;
}

// Everything but the login check, which only some files need.
function classifyWithoutLogin(file, { linked, oddLinks, participantIds, legacyIds, now }) {
  if (linked.has(file.path)) return null;
  if (now - new Date(file.createdAt).getTime() < MIN_AGE_MS) return KEPT.recent;
  if (!UUID.test(file.folder)) return KEPT.outsideFolder;
  if (oddLinks.some((link) => link.includes(file.path))) return KEPT.oddLink;
  if (legacyIds.has(file.folder)) return KEPT.legacy;
  if (participantIds.has(file.folder)) return DELETABLE.replaced;
  return "needs login check";
}

const BY_LOGIN = { exists: DELETABLE.unfinished, missing: DELETABLE.deletedAccount, unknown: DELETABLE.unknownLogin };

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const day = (iso) => iso?.slice(0, 10) ?? "?";

async function main() {
  const [files, participants, legacy] = await Promise.all([
    listAllFiles(),
    selectAll("jury_participants", "user_id, driver_license_image_url", "user_id"),
    selectAll("oldData", "user_id", "id"),
  ]);
  const links = participants.map((p) => p.driver_license_image_url).filter(Boolean);
  const filePaths = new Set(files.map((file) => file.path));
  const context = {
    linked: new Set(links),
    // Links that aren't exactly a file path (a full URL, a leading slash, a missing file).
    // Any file named inside one is kept rather than guessed about.
    oddLinks: links.filter((link) => !filePaths.has(link)),
    participantIds: new Set(participants.map((p) => p.user_id)),
    legacyIds: new Set(legacy.map((row) => row.user_id).filter(Boolean)),
    now: Date.now(),
  };

  const firstPass = files.map((file) => [file, classifyWithoutLogin(file, context)]);
  const logins = await loginStatus(
    new Set(firstPass.filter(([, kind]) => kind === "needs login check").map(([file]) => file.folder))
  );

  const groups = new Map();
  for (const [file, firstKind] of firstPass) {
    const kind = firstKind === "needs login check" ? BY_LOGIN[logins.get(file.folder)] : firstKind;
    if (!kind) continue;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind).push(file);
  }

  console.log(
    `${files.length} files in ${BUCKET}. ${participants.length} participants, ${links.length} with a photo link` +
      ` (${context.linked.size} distinct, ${context.oddLinks.length} not matching a file).\n`
  );
  const deletable = [];
  for (const [label, kinds] of [["Will delete", DELETABLE], ["Keeping", KEPT]]) {
    for (const kind of Object.values(kinds)) {
      const group = groups.get(kind) ?? [];
      if (group.length === 0) continue;
      const dates = group.map((file) => file.createdAt).sort();
      const size = group.reduce((sum, file) => sum + file.size, 0);
      console.log(`${label}: ${kind} — ${group.length} files, ${mb(size)}, ${day(dates[0])} to ${day(dates.at(-1))}`);
      if (kinds === DELETABLE) deletable.push(...group);
    }
  }
  const total = deletable.reduce((sum, file) => sum + file.size, 0);
  console.log(`\nTotal to delete: ${deletable.length} files, ${mb(total)}`);

  if (!shouldDelete) {
    console.log(`\nNothing deleted. To delete, run again with: --delete --expect=${deletable.length}`);
    return;
  }
  if (expected !== deletable.length) {
    const given = Number.isNaN(expected) ? "missing" : expected;
    console.error(`\nNot deleting: found ${deletable.length} files, but --expect is ${given}. Check the list again.`);
    process.exitCode = 1;
    return;
  }

  let removed = 0;
  for (let i = 0; i < deletable.length; i += 100) {
    const batch = deletable.slice(i, i + 100).map((file) => file.path);
    const { data, error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove: ${error.message}`);
    removed += data.length;
  }
  console.log(`\nDeleted ${removed} of ${deletable.length} files.`);
  if (removed !== deletable.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
