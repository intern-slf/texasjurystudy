/**
 * One-time cutover sync of ID photos from the Supabase "id-documents" bucket to the GCS
 * bucket that replaced it (gs://texasjurystudy-id-documents — see docs/gcs-id-documents.md).
 * Copies a Supabase file only when BOTH hold: it is missing in GCS (or differs in size),
 * AND a jury_participants profile currently links it — i.e. uploads that landed in
 * Supabase after the 2026-10-07 bulk copy and are actually in use. The linked-only rule
 * is what makes re-running safe: after cutover the app deletes GCS objects deliberately
 * (replaced photos, underage account deletion), the frozen Supabase bucket still holds
 * those bytes, and copying everything would resurrect them. It never deletes anything,
 * in either bucket. A linked file deleted from GCS by hand WILL be restored.
 *
 * Run from client/:
 *   node scripts/sync-id-documents-to-gcs.mjs           dry run: list what would copy
 *   node scripts/sync-id-documents-to-gcs.mjs --apply   actually copy
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (or the
 * file named by ENV_FILE), and Google Application Default Credentials for the GCS side
 * (gcloud auth application-default login). The GCS bucket name comes from
 * GCS_ID_DOCUMENTS_BUCKET, defaulting to texasjurystudy-id-documents.
 */

import { createClient } from "@supabase/supabase-js";
import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SUPABASE_BUCKET = "id-documents";
const PAGE = 1000;

// Load .env.local manually, like scripts/cleanup-id-photos.mjs.
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

const GCS_BUCKET = process.env.GCS_ID_DOCUMENTS_BUCKET || "texasjurystudy-id-documents";
const gcsBucket = new Storage().bucket(GCS_BUCKET);

const apply = process.argv.slice(2).includes("--apply");

// The uploads set the real content type on the GCS object; GCS serves files by object
// metadata, not by extension, so an octet-stream fallback only affects how a browser
// displays an unrecognised extension.
const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};
const contentTypeFor = (filePath) =>
  CONTENT_TYPES[filePath.split(".").pop()?.toLowerCase()] ?? "application/octet-stream";

// Pages stop only when one comes back empty, so a server-side cap below PAGE can't end
// a listing early and make a Supabase file look already copied.
async function listFolder(prefix) {
  const entries = [];
  for (;;) {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .list(prefix, { limit: PAGE, offset: entries.length, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    if (data.length === 0) return entries;
    entries.push(...data);
  }
}

async function listSupabaseFiles() {
  const files = [];
  for (const entry of await listFolder("")) {
    // A null id is a folder; this bucket only nests one level deep.
    if (entry.id !== null) {
      files.push({ path: entry.name, size: entry.metadata?.size ?? 0 });
      continue;
    }
    for (const file of await listFolder(entry.name)) {
      if (file.id === null) continue;
      files.push({ path: `${entry.name}/${file.name}`, size: file.metadata?.size ?? 0 });
    }
  }
  return files;
}

// Ordered by a unique column, so a row updated mid-read can't move between pages and be
// skipped (same discipline as scripts/cleanup-id-photos.mjs).
async function listLinkedPaths() {
  const paths = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("jury_participants")
      .select("driver_license_image_url")
      .order("user_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`jury_participants: ${error.message}`);
    if (data.length === 0) return paths;
    for (const row of data) {
      if (row.driver_license_image_url) paths.add(row.driver_license_image_url);
    }
  }
}

// GCS lists objects flat; the loop follows page tokens until none comes back.
async function listGcsSizes() {
  const sizes = new Map();
  let query = { maxResults: PAGE, autoPaginate: false };
  for (;;) {
    const [page, nextQuery] = await gcsBucket.getFiles(query);
    for (const file of page) sizes.set(file.name, Number(file.metadata?.size ?? 0));
    if (!nextQuery) return sizes;
    query = nextQuery;
  }
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const [supabaseFiles, gcsSizes, linkedPaths] = await Promise.all([
    listSupabaseFiles(),
    listGcsSizes(),
    listLinkedPaths(),
  ]);
  const candidates = supabaseFiles.filter((file) => gcsSizes.get(file.path) !== file.size);
  const toCopy = candidates.filter((file) => linkedPaths.has(file.path));
  const skipped = candidates.length - toCopy.length;
  const toCopyBytes = toCopy.reduce((sum, file) => sum + file.size, 0);

  console.log(
    `${supabaseFiles.length} files in Supabase "${SUPABASE_BUCKET}", ${gcsSizes.size} in gs://${GCS_BUCKET}:` +
      ` ${toCopy.length} to copy (${mb(toCopyBytes)}).\n`
  );
  if (skipped > 0) {
    console.log(
      `Skipping ${skipped} Supabase file(s) no profile links — replaced photos, abandoned ` +
        `signups, or files the app deliberately deleted from GCS.\n`
    );
  }
  if (toCopy.length === 0) {
    console.log("Nothing to copy — every profile-linked Supabase file is already in GCS at the same size.");
    return;
  }

  let copied = 0;
  let copiedBytes = 0;
  let failed = 0;
  for (const file of toCopy) {
    const reason = gcsSizes.has(file.path)
      ? `size differs (Supabase ${file.size}, GCS ${gcsSizes.get(file.path)} bytes)`
      : "missing in GCS";
    if (!apply) {
      console.log(`would copy: ${file.path} — ${reason}`);
      continue;
    }
    try {
      const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(file.path);
      if (error) throw new Error(`download: ${error.message}`);
      const buffer = Buffer.from(await data.arrayBuffer());
      await gcsBucket.file(file.path).save(buffer, { contentType: contentTypeFor(file.path), resumable: false });
      copied += 1;
      copiedBytes += buffer.length;
      console.log(`copied: ${file.path} (${buffer.length} bytes) — ${reason}`);
    } catch (err) {
      failed += 1;
      console.error(`FAILED: ${file.path} — ${err.message}`);
    }
  }

  if (!apply) {
    console.log(`\nDry run: ${toCopy.length} files (${mb(toCopyBytes)}) would copy. Nothing written. Run again with --apply.`);
    return;
  }
  console.log(`\nCopied ${copied} of ${toCopy.length} files (${mb(copiedBytes)} of ${mb(toCopyBytes)}); ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
