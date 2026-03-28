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
        panel: "var(--panel)",
        primary: "var(--primary)",
        secondary: "var(--secondary)",
        success: "var(--success)",
        danger: "var(--danger)",
        text: "var(--text)",
        muted: "var(--muted)"
      },
      boxShadow: {
        panel: "0 20px 45px rgba(0, 0, 0, 0.28)"
      }
    }
  },
  plugins: []
};

export default config;
