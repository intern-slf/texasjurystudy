import crypto from "crypto";

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

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

export function generateEmailActionToken(
  inviteId: string,
  action: "accepted" | "declined",
  secret: string
): string {
  const exp = Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS;
  const payload = toBase64Url(JSON.stringify({ inviteId, action, exp }));
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyEmailActionToken(
  token: string,
  secret: string
): { inviteId: string; action: "accepted" | "declined" } | null {
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
      typeof data.inviteId !== "string" ||
      (data.action !== "accepted" && data.action !== "declined") ||
      typeof data.exp !== "number"
    ) {
      return null;
    }

    if (Math.floor(Date.now() / 1000) > data.exp) return null;

    return { inviteId: data.inviteId, action: data.action };
  } catch {
    return null;
  }
}
