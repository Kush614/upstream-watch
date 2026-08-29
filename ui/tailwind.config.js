/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        dim: "var(--dim)",
        panel: "var(--panel)",
        line: "var(--line)",
        ok: "var(--ok)",
        bad: "var(--bad)",
        warn: "var(--warn)",
        accent: "var(--accent)",
        cream: "var(--cream)",
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', "Palatino", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      keyframes: {
        slideIn: { from: { transform: "translateY(12px)", opacity: "0" }, to: { transform: "none", opacity: "1" } },
        pulseRing: { "0%,100%": { opacity: "0.35" }, "50%": { opacity: "1" } },
      },
      animation: {
        slideIn: "slideIn .45s cubic-bezier(.2,.8,.2,1) both",
        pulseRing: "pulseRing 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
