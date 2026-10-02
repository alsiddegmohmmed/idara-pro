import type { Config } from "tailwindcss";

// Tokens live as CSS variables in src/index.css (docs/design/ui-spec.md §2–4);
// Tailwind only maps names onto them so components never hard-code a hex value.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        ink: {
          DEFAULT: "var(--ink)",
          muted: "var(--ink-muted)",
        },
        line: {
          DEFAULT: "var(--line)",
          strong: "var(--line-strong)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          soft: "var(--primary-soft)",
          deep: "var(--primary-deep)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)", solid: "var(--danger-solid)" },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        neutral: { soft: "var(--neutral-soft)" },
        overlay: "var(--overlay)",
      },
      fontSize: {
        // [size, line-height] per §3 — Arabic needs the extra leading.
        "page-title": ["24px", { lineHeight: "36px", fontWeight: "600" }],
        section: ["18px", { lineHeight: "28px", fontWeight: "600" }],
        subsection: ["16px", { lineHeight: "26px", fontWeight: "600" }],
        body: ["15px", { lineHeight: "26px" }],
        dense: ["14px", { lineHeight: "22px" }],
        meta: ["13px", { lineHeight: "20px" }],
      },
      borderRadius: {
        control: "6px",
        panel: "var(--radius-panel)",
      },
      boxShadow: {
        float: "var(--shadow-float)",
      },
      // Motion only for floating layers, 150–200ms; index.css disables it under reduced motion.
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        // Top progress bar: travels from the inline-start to the inline-end.
        progress: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(300%)" } },
        "progress-rtl": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(-300%)" } },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "pop-in": "pop-in 150ms ease-out",
        progress: "progress 1.2s ease-in-out infinite",
        "progress-rtl": "progress-rtl 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
