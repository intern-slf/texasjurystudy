import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMailerAuthToken } from "@/lib/mailerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * For an uptime monitor: 200 when the app can reach its database and its
 * mailer, 503 when it can't. The monitor pages us, not our own mailer, so
 * the mailer being down still gets reported.
 *
 *   database  a one-row read with the service role
 *   mailer    the Cloud Run mailer's /health, through the same Vercel OIDC →
 *             Google token path every email takes, so a broken federation or
 *             IAM binding shows up here before a firm notices missing mail
 *
 * Public, so it says only ok or fail per check; the reason goes to the logs
 * (and Sentry). Answers from a 30-second cache, so hammering it can't run up
 * database or Cloud Run calls.
 *
 * The mailer only admits production's OIDC subject, so on a preview the mailer
 * check fails by design. Point the monitor at production.
 */

type Check = "ok" | "fail";
type Report = { ok: boolean; checks: { database: Check; mailer: Check } };

const CACHE_MS = 30_000;
const TIMEOUT_MS = 10_000;

let cached: { at: number; report: Report } | null = null;

async function checkDatabase(): Promise<Check> {
  try {
    const { error } = await supabaseAdmin
      .from("cases")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (error) throw new Error(error.message);
    return "ok";
  } catch (err) {
    console.error("[health] database check failed:", err);
    return "fail";
  }
}

async function checkMailer(): Promise<Check> {
  try {
    const url = process.env.MAILER_URL?.trim().replace(/\/$/, "");
    if (!url) throw new Error("MAILER_URL is not set");
    const token = await getMailerAuthToken();
    const res = await fetch(`${url}/health`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`mailer /health answered ${res.status}`);
    return "ok";
  } catch (err) {
    console.error("[health] mailer check failed:", err);
    return "fail";
  }
}

export async function GET() {
  if (!cached || Date.now() - cached.at > CACHE_MS) {
    const [database, mailer] = await Promise.all([checkDatabase(), checkMailer()]);
    cached = { at: Date.now(), report: { ok: database === "ok" && mailer === "ok", checks: { database, mailer } } };
  }
  return NextResponse.json(cached.report, {
    status: cached.report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
