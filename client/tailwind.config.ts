import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * The default Tailwind ramps are re-pointed at the brand kit palette so the
 * hundreds of existing `slate-*` / `blue-*` utilities across the app render in
 * brand colors without every call site being rewritten:
 *
 *   slate + gray -> warm neutrals (parchment, hairline, ink)
 *   blue         -> Lone Star Navy / Capitol Blue
 *   red          -> Statute Red
 *   green        -> the kit's muted forest green
 *   amber/yellow -> Verdict Gold
 *
 * Only color values are affected — sizing, spacing, radius and type stay as
 * they were.
 */

const neutral = {
  50: "#F7F4EE", // Parchment
  100: "#F1EDE4",
  200: "#DAD5C8", // Hairline
  300: "#C0BEB9",
  400: "#726F66", // 5.02:1 on white — `text-slate-400` is used for real body copy
  500: "#6B6960",
  600: "#54524A",
  700: "#3F3E38",
  800: "#2A2925",
  900: "#1B1B1B", // Ink
  950: "#121211",
};

const navy = {
  50: "#EFF3F9",
  100: "#E6EAF0", // Navy 100
  200: "#C9D4EA",
  300: "#B3BFD2", // Navy 300
  400: "#7C93BC",
  500: "#3B6EA5", // Capitol Blue
  600: "#012A68", // Lone Star Navy
  700: "#011F52",
  800: "#011A44", // Navy deep
  900: "#011436",
  950: "#000C1F",
};

const statuteRed = {
  50: "#FCF4F5",
  100: "#F9E9EA", // Red 100
  200: "#F2D4D7",
  300: "#EDBCC1", // Red 300
  400: "#D86F78", // Red 600 (kit)
  500: "#C32130", // Statute Red
  600: "#B21C2A",
  700: "#8F1A24", // Red deep
  800: "#75151E",
  900: "#5C1118",
  950: "#3A0A0F",
};

const forest = {
  50: "#F0F6F1",
  100: "#E3EFE6",
  200: "#C7DFCD",
  300: "#A3CBAC",
  400: "#5E9B6D",
  500: "#3E7C4F",
  600: "#2D6A3E",
  700: "#245634",
  800: "#1D4429",
  900: "#17351F",
  950: "#0C1D12",
};

const verdictGold = {
  50: "#FDF8EE",
  100: "#FBF0DD",
  200: "#F4E2BE",
  300: "#E9CE93",
  400: "#CDAA5B",
  500: "#AD8A37", // Verdict Gold
  600: "#8A6A1E",
  700: "#6E5418",
  800: "#574214",
  900: "#453410",
  950: "#251C08",
};

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },

        /* Named brand colors for anything that needs them explicitly. */
        brand: {
          navy: "#012A68",
          "navy-deep": "#011A44",
          red: "#C32130",
          "red-deep": "#8F1A24",
          gold: "#AD8A37",
          capitol: "#3B6EA5",
          parchment: "#F7F4EE",
          ink: "#1B1B1B",
          hairline: "#DAD5C8",
        },

        /* Re-pointed default ramps (see note at top of file). */
        slate: neutral,
        gray: neutral,
        zinc: neutral,
        neutral: neutral,
        stone: neutral,
        blue: navy,
        sky: navy,
        indigo: navy,
        red: statuteRed,
        rose: statuteRed,
        green: forest,
        emerald: forest,
        amber: verdictGold,
        yellow: verdictGold,
        orange: {
          50: "#FDF5EF",
          100: "#FAE8D8",
          200: "#F2D2B4",
          300: "#E5B384",
          400: "#D08E4E",
          500: "#B87333",
          600: "#97591F",
          700: "#7A4719",
          800: "#613914",
          900: "#4E2E11",
          950: "#2A1808",
        },
        purple: {
          50: "#F2F1F8",
          100: "#E6E4F0",
          200: "#CFCBE2",
          300: "#B0AACE",
          400: "#8179AC",
          500: "#5C5490",
          600: "#443C74",
          700: "#36305C",
          800: "#2C2749",
          900: "#241F3B",
          950: "#14111F",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
