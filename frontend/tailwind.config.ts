import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./store/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        panel: "var(--color-panel)",
        surface: "var(--color-surface)",
        primary: "var(--color-primary)",
        secondary: "var(--color-secondary)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        text: "var(--color-text)",
        muted: "var(--color-muted)"
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        glow: "var(--glow-cyan)"
      }
    }
  },
  plugins: []
};

export default config;
