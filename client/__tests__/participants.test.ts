import { describe, it } from "vitest";

// Participants section — scaffolded placeholders.
// Each `it.todo` documents a test case that still needs to be written.
// Replace with real `it(..., async () => {...})` once the underlying
// server actions / RLS policies are stable.
describe("Participants", () => {
  describe("create-profile.test.ts", () => {
    it.todo("Happy path");
    it.todo("Missing required demographic");
    it.todo("Duplicate profile prevention");
  });

  describe("update-profile-self.test.ts", () => {
    it.todo("User can update only own profile");
  });

  describe("update-profile-admin.test.ts", () => {
    it.todo("Admin can update any profile");
    it.todo("Non-admin blocked");
  });
});
