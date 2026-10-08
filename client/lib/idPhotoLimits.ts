// Shared between the upload forms (client) and the GCS signing code (server):
// the V4 upload signature binds `x-goog-content-length-range`, so the PUT must
// send exactly the value that was signed or GCS rejects it.
export const MAX_ID_PHOTO_BYTES = 10 * 1024 * 1024;
export const ID_PHOTO_CONTENT_LENGTH_RANGE = `1,${MAX_ID_PHOTO_BYTES}`;
