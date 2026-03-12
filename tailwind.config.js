/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
      },
      colors: {
        null: {
          bg: "#0a0a0a",
          surface: "#111111",
          border: "#1f1f1f",
          muted: "#2a2a2a",
          text: "#e8e8e8",
          dim: "#888888",
          accent: "#7c3aed",
          "accent-dim": "#4c1d95",
          "accent-glow": "#a855f7",
          green: "#22c55e",
          yellow: "#eab308",
          red: "#ef4444",
        },
      },
    },
  },
  plugins: [],
};
