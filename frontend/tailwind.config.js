/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dde8ff",
          200: "#bdd2ff",
          300: "#94b3ff",
          400: "#658cfb",
          500: "#3f63f3",
          600: "#2543e0",
          700: "#1c33b8",
          800: "#1c2e95",
          900: "#1c2c7a",
        },
        ink: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,.04), 0 1px 4px rgba(15,23,42,.06)",
        card: "0 4px 14px -6px rgba(15,23,42,.10), 0 2px 4px -2px rgba(15,23,42,.06)",
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
