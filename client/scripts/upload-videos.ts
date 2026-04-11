/**
 * Upload focus group videos to Supabase Storage.
 *
 * Prerequisites:
 *   1. Create a bucket called "videos" in your Supabase dashboard
 *      → Storage → New Bucket → Name: "videos" → Toggle "Public bucket" ON
 *   2. Make sure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   npx tsx scripts/upload-videos.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually (no dotenv dependency needed)
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = "videos";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const PUBLIC_DIR = path.resolve(__dirname, "../public");

// Videos to upload — key = storage path, value = local filename in public/
const VIDEOS: Record<string, string> = {
  "general_instructions.mp4": "general_instructions.mp4",
  "Narrative_1.mp4": "Narrative_1.mp4",
  "Narrative_2.mp4": "Narrative_2.mp4",
  "Narrative_3.mp4": "Narrative_3.mp4",
  "Opening_statement_1.mp4": "Opening_statement_1.mp4",
  "Opening_statement_2.mp4": "Opening_statement_2.mp4",
  "Opening_statement_3.mp4": "Opening_statement_3.mp4",
};

async function main() {
  // Ensure bucket exists
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET);

  if (!exists) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) {
      console.error("Failed to create bucket:", error.message);
      process.exit(1);
    }
    console.log(`Created public bucket "${BUCKET}"`);
  } else {
    console.log(`Bucket "${BUCKET}" already exists`);
  }

  // Upload each video
  for (const [storagePath, localFile] of Object.entries(VIDEOS)) {
    const filePath = path.join(PUBLIC_DIR, localFile);

    if (!fs.existsSync(filePath)) {
      console.warn(`  SKIP  ${localFile} — file not found in public/`);
      continue;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (error) {
      console.error(`  FAIL  ${storagePath}: ${error.message}`);
    } else {
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;
      console.log(`  OK    ${storagePath}`);
      console.log(`        ${publicUrl}`);
    }
  }

  console.log("\nDone! You can now delete the .mp4 files from public/.");
}

main();
