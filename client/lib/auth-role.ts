export type Role = "requestee" | "participant" | null;

/** Narrows an untrusted `user_metadata.role` value to a known Role. */
export function readRole(metadataRole: unknown): Role {
  if (metadataRole === "requestee" || metadataRole === "participant") {
    return metadataRole;
  }
  return null;
}
