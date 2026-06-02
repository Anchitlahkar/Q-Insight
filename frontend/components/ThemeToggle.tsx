"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel)" }} />
    );
  }

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="quantum-button"
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        position: "relative",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        transition: "all 0.2s ease",
      }}
      aria-label="Toggle theme"
    >
      <Sun
        className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        style={{ color: "var(--accent)", position: "absolute" }}
      />
      <Moon
        className="h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        style={{ color: "var(--accent)", position: "absolute" }}
      />
    </button>
  );
}
