/**
 * True for an absolute http: or https: URL. Firms type the Drive links on their cases,
 * and those links are shown to admins and put into emails, so anything else
 * (javascript:, data:, a bare word) is refused when it is saved and never rendered as
 * a link. Pure, so the browser can check a link before sending it.
 */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
