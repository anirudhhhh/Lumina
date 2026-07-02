/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // --- Lumina Identity tokens (from design.md) ---
        surface: "#14140f",
        "surface-dim": "#14140f",
        "surface-bright": "#3a3933",
        "surface-container-lowest": "#0e0e0a",
        "surface-container-low": "#1c1c17",
        "surface-container": "#20201a",
        "surface-container-high": "#2a2a25",
        "surface-container-highest": "#35352f",
        "on-surface": "#e5e2da",
        "on-surface-variant": "#c4c6cc",
        "inverse-surface": "#e5e2da",
        "inverse-on-surface": "#31312b",
        outline: "#8e9196",
        "outline-variant": "#44474c",
        "surface-tint": "#bbc7da",
        primary: "#bbc7da",
        "on-primary": "#253140",
        "primary-container": "#1e2a38",
        "on-primary-container": "#8591a2",
        "inverse-primary": "#535f6f",
        secondary: "#7fd0ff",
        "on-secondary": "#00344a",
        "secondary-container": "#339acc",
        "on-secondary-container": "#002d41",
        tertiary: "#95d2ca",
        "on-tertiary": "#003733",
        "tertiary-container": "#002f2b",
        "on-tertiary-container": "#5f9b94",
        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
        background: "#14140f",
        "on-background": "#e5e2da",
        "surface-variant": "#35352f",
        // Collage accents referenced by reference.html
        terracotta: "#e2725b",
        sage: "#b2d8d8",
        "accent-red": "#e2725b",
        "accent-teal": "#b2d8d8",
      },
      fontFamily: {
        display: ["Playfair Display", "serif"],
        headline: ["Playfair Display", "serif"],
        body: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        label: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
        code: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
      spacing: {
        gutter: "24px",
        "margin-desktop": "40px",
      },
      boxShadow: {
        // Sophisticated multi-layer shadow with a hint of secondary (design.md)
        paper:
          "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(62,162,212,0.10)",
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        scanline: "scanline 10s linear infinite",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
