import crypto from "crypto";

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
// CAN-SPAM requires an unsubscribe link to keep working for at least 30 days
// after the email is sent. A year leaves a wide margin for someone who digs up
// an old email, and all the token can do is set its own participant to "no".
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type ReactivationAction = "yes" | "no" | "edit" | "unsubscribe";

const TTL_SECONDS: Record<ReactivationAction, number> = {
  yes: THIRTY_DAYS_SECONDS,
  no: THIRTY_DAYS_SECONDS,
  edit: THIRTY_DAYS_SECONDS,
  unsubscribe: ONE_YEAR_SECONDS,
};

function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function fromBase64Url(str: string): string {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function sign(payload: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// The action is HMAC-bound so the Yes/No choice can't be tampered with by
// rewriting query strings — each button in the email carries its own token.
export function generateReactivationToken(
  participantId: string,
  action: ReactivationAction,
  secret: string
): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS[action];
  const payload = toBase64Url(JSON.stringify({ participantId, action, exp }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyReactivationToken(
  token: string,
  secret: string
): { participantId: string; action: ReactivationAction } | null {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const payload = token.slice(0, dotIndex);
    const providedSig = token.slice(dotIndex + 1);
    const expectedSig = sign(payload, secret);

    if (providedSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) return null;

    const data = JSON.parse(fromBase64Url(payload));

    if (
      typeof data.participantId !== "string" ||
      (data.action !== "yes" &&
        data.action !== "no" &&
        data.action !== "edit" &&
        data.action !== "unsubscribe") ||
      typeof data.exp !== "number"
    ) {
      return null;
    }

    if (Math.floor(Date.now() / 1000) > data.exp) return null;

    return { participantId: data.participantId, action: data.action };
  } catch {
    return null;
  }
}
