/**
 * Texas Jury Study wordmark, drawn as inline SVG.
 *
 * Geometry and colors are traced from the original public/logo.png
 * (332x113): navy panel 0..89, red bar starting at y=62, star centered
 * at (43.5, 60) with circumradius 38.
 *
 * The two words use `textLength` + `lengthAdjust="spacingAndGlyphs"` so the
 * wordmark keeps its measured proportions even when the serif stack falls
 * back to a different font.
 */

const SERIF = "Georgia, 'Times New Roman', Times, serif";

// Star: 5 points, point-up, outer radius 38 / inner radius 14.51.
const STAR =
  "M 43.50 22.00 L 52.03 48.26 L 79.64 48.26 L 57.30 64.49 L 65.84 90.74 " +
  "L 43.50 74.51 L 21.16 90.74 L 29.70 64.49 L 7.36 48.26 L 34.97 48.26 Z";

export default function Logo({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 332 113"
      role="img"
      aria-label="Texas Jury Study"
      className={className}
    >
      {/* Field behind TEXAS — drops out in dark mode so the mark sits on the navbar */}
      <rect x="89" y="0" width="243" height="62" className="fill-white dark:fill-transparent" />

      {/* Red bar behind JURY STUDY */}
      <rect
        x="89"
        y="62"
        width="243"
        height="51"
        className="fill-[#b33336] dark:fill-[#c23c40]"
      />

      {/* Navy panel + star */}
      <rect x="0" y="0" width="89" height="113" className="fill-[#0e2a64] dark:fill-[#1e4291]" />
      <path d={STAR} fill="#ffffff" />

      <text
        x="210.5"
        y="56"
        textAnchor="middle"
        textLength="217"
        lengthAdjust="spacingAndGlyphs"
        fontFamily={SERIF}
        fontSize="60.5"
        fontWeight="700"
        className="fill-[#b33336] dark:fill-[#e35d62]"
      >
        TEXAS
      </text>

      <text
        x="210.5"
        y="94"
        textAnchor="middle"
        textLength="224"
        lengthAdjust="spacingAndGlyphs"
        fontFamily={SERIF}
        fontSize="34.7"
        fontWeight="700"
        fill="#ffffff"
      >
        JURY STUDY
      </text>
    </svg>
  );
}
