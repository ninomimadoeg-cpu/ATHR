/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0d0f0e", mint: "#b8f5d0", "mint-ink": "#0b6b3f", done: "#1f8a5b", behind: "#c8321f" },
      fontFamily: { sans: ["Inter", "IBM Plex Sans Arabic", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
