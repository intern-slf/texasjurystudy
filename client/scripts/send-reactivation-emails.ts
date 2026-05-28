/**
 * Send the "Are you still interested?" reactivation email to every eligible
 * participant in one shot — runs locally so it isn't bound by Vercel's
 * 10-second function timeout. Use this for the initial bulk campaign; for
 * smaller targeted sends use the Send Mail flow in the admin UI.
 *
 * Eligibility:
 *   - approved_by_admin = true
 *   - blacklisted_at IS NULL
 *   - email is set
 *   - reactivation_status IS NULL or 'pending'
 *
 * Prerequisites — these must be in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EMAIL_ACTION_SECRET
 *   NEXT_PUBLIC_APP_URL
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *
 * Run:
 *   npx tsx scripts/send-reactivation-emails.ts          # send
 *   npx tsx scripts/send-reactivation-emails.ts --dry-run # preview only
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load .env.local manually BEFORE any module that reads env at import time
// (lib/mail.ts creates the nodemailer transporter at module load).
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.EMAIL_ACTION_SECRET;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  EMAIL_ACTION_SECRET: SECRET,
  NEXT_PUBLIC_APP_URL: APP_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
})) {
  if (!value) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
}

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 10;

const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!);

async function main() {
  // Dynamic import so .env.local is loaded before mail.ts initialises its
  // SMTP transporter from process.env.
  const { sendReactivationEmail } = await import("../lib/mail");
  const { generateReactivationToken } = await import("../lib/reactivationToken");

  console.log("Fetching eligible participants…");
  const { data: rows, error } = await supabase
    .from("jury_participants")
    .select("user_id, email, first_name")
    .eq("approved_by_admin", true)
    .is("blacklisted_at", null)
    .not("email", "is", null)
    .or("reactivation_status.is.null,reactivation_status.eq.pending");

  if (error) {
    console.error("Failed to fetch participants:", error.message);
    process.exit(1);
  }

  const recipients = (rows ?? []).filter(
    (r): r is { user_id: string; email: string; first_name: string | null } =>
      typeof r.email === "string" && r.email.trim() !== ""
  );

  console.log(`Eligible recipients: ${recipients.length}`);

  if (recipients.length === 0) {
    console.log("Nothing to send. Exiting.");
    return;
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN — would send to:");
    recipients.forEach((r, i) =>
      console.log(`  ${String(i + 1).padStart(4)}. ${r.email}  (${r.first_name ?? "—"})`)
    );
    console.log("\nNo emails sent. Re-run without --dry-run to actually send.");
    return;
  }

  console.log(`\nSending with concurrency=${CONCURRENCY}…\n`);
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const deadlineIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  let sent = 0;
  let failed = 0;
  const errors: { userId: string; email: string; error: string }[] = [];

  async function processOne(row: { user_id: string; email: string; first_name: string | null }) {
    try {
      const yesToken = generateReactivationToken(row.user_id, "yes", SECRET!);
      const noToken = generateReactivationToken(row.user_id, "no", SECRET!);
      const yesUrl = `${APP_URL}/api/email-action/reactivate?token=${encodeURIComponent(yesToken)}`;
      const noUrl = `${APP_URL}/api/email-action/reactivate?token=${encodeURIComponent(noToken)}`;

      await sendReactivationEmail({
        to: row.email,
        firstName: row.first_name,
        yesUrl,
        noUrl,
      });

      const { error: updateErr } = await supabase
        .from("jury_participants")
        .update({
          reactivation_email_sent_at: nowIso,
          reactivation_deadline_at: deadlineIso,
        })
        .eq("user_id", row.user_id);

      if (updateErr) {
        failed++;
        errors.push({ userId: row.user_id, email: row.email, error: `db update failed: ${updateErr.message}` });
      } else {
        sent++;
        if (sent % 25 === 0 || sent === recipients.length) {
          const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
          console.log(`  ${sent}/${recipients.length} sent  (${elapsed}s elapsed)`);
        }
      }
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : "unknown error";
      errors.push({ userId: row.user_id, email: row.email, error: message });
    }
  }

  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    await Promise.all(recipients.slice(i, i + CONCURRENCY).map(processOne));
  }

  const totalSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${totalSec}s.  Sent: ${sent}   Failed: ${failed}`);

  if (errors.length) {
    console.log("\nFailures:");
    errors.forEach((e) => console.log(`  - ${e.email} (${e.userId.slice(0, 8)}…): ${e.error}`));
  }
}

main().catch((err) => {
  console.error("Script crashed:", err);
  process.exit(1);
});
