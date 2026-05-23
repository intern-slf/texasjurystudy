import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateEmailActionToken,
  verifyEmailActionToken,
} from "@/lib/emailActionToken";

const SECRET = "test-secret-for-ci-only";

describe("generateEmailActionToken + verifyEmailActionToken", () => {
  it("round-trips a valid token and returns the original inviteId + action", () => {
    const token = generateEmailActionToken("invite-123", "accepted", SECRET);
    const result = verifyEmailActionToken(token, SECRET);

    expect(result).toEqual({ inviteId: "invite-123", action: "accepted" });
  });

  it("round-trips a 'declined' action", () => {
    const token = generateEmailActionToken("invite-xyz", "declined", SECRET);
    const result = verifyEmailActionToken(token, SECRET);

    expect(result).toEqual({ inviteId: "invite-xyz", action: "declined" });
  });

  it("returns null when verified with a different secret", () => {
    const token = generateEmailActionToken("invite-123", "accepted", SECRET);
    const result = verifyEmailActionToken(token, "different-secret");

    expect(result).toBeNull();
  });

  it("returns null when the signature is tampered with", () => {
    const token = generateEmailActionToken("invite-123", "accepted", SECRET);
    const dotIndex = token.lastIndexOf(".");
    const payload = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);
    const flipped = sig[0] === "A" ? "B" + sig.slice(1) : "A" + sig.slice(1);
    const tampered = `${payload}.${flipped}`;

    expect(verifyEmailActionToken(tampered, SECRET)).toBeNull();
  });

  it("returns null when the payload is mutated but the signature is unchanged", () => {
    const token = generateEmailActionToken("invite-123", "accepted", SECRET);
    const dotIndex = token.lastIndexOf(".");
    const payload = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);
    const tamperedPayload = payload.slice(0, -2) + (payload.endsWith("AA") ? "BB" : "AA");

    expect(verifyEmailActionToken(`${tamperedPayload}.${sig}`, SECRET)).toBeNull();
  });

  it("returns null for a malformed token with no separator", () => {
    expect(verifyEmailActionToken("not-a-real-token", SECRET)).toBeNull();
  });

  it("returns null for an empty token", () => {
    expect(verifyEmailActionToken("", SECRET)).toBeNull();
  });

  describe("expiration", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns null once more than 7 days have passed", () => {
      const token = generateEmailActionToken("invite-123", "accepted", SECRET);
      vi.setSystemTime(new Date("2025-01-08T00:00:01Z"));

      expect(verifyEmailActionToken(token, SECRET)).toBeNull();
    });

    it("still verifies 6 days after issuance", () => {
      const token = generateEmailActionToken("invite-123", "accepted", SECRET);
      vi.setSystemTime(new Date("2025-01-07T00:00:00Z"));

      expect(verifyEmailActionToken(token, SECRET)).toEqual({
        inviteId: "invite-123",
        action: "accepted",
      });
    });
  });

  it("returns the inviteId that was signed (not some other one)", () => {
    const tokenA = generateEmailActionToken("invite-A", "accepted", SECRET);
    const tokenB = generateEmailActionToken("invite-B", "accepted", SECRET);

    expect(verifyEmailActionToken(tokenA, SECRET)?.inviteId).toBe("invite-A");
    expect(verifyEmailActionToken(tokenB, SECRET)?.inviteId).toBe("invite-B");
  });
});
