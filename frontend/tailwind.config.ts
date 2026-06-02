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
        background: "var(--background)",
        foreground: "var(--foreground)",
        muted: "var(--muted)",
        panel: "var(--panel)",
        "panel-secondary": "var(--panel-secondary)",
        card: "var(--card)",
        border: "var(--border)",
        input: "var(--input)",
        canvas: "var(--canvas)",
        hover: "var(--hover)",
        accent: "var(--accent)",
        "accent-secondary": "var(--accent-secondary)",
        // Aliases for transition
        primary: "var(--accent)",
        secondary: "var(--accent-secondary)",
        success: "var(--success)",
        danger: "var(--danger)",
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
