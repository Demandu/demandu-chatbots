import type { Config } from "tailwindcss";

/**
 * Demandu Design System 2.0 — tokens del Brand Book (Mayo 2025)
 * Colores, tipografía y sombras oficiales de la marca.
 */
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Colores principales
        navy: {
          DEFAULT: "#0B0B4F",
          deep: "#14142B",
          900: "#0B0B4F",
          950: "#080830",
        },
        pink: {
          DEFAULT: "#F64A97",
          500: "#F64A97",
          600: "#E03A83",
          400: "#FF6FB0",
        },
        violet: {
          DEFAULT: "#6E42FF",
          500: "#6E42FF",
          600: "#5A34D6",
          400: "#8B66FF",
        },
        // Colores secundarios
        mist: "#F5F7FB",
        lavender: "#D6D5FF",
        slate: {
          DEFAULT: "#2C2E43",
          deep: "#14142B",
        },
        // Colores de acento (estados)
        success: "#3DDC97",
        warning: "#FFC857",
        danger: "#FF5A5F",
        info: "#3A85FF",
        // Superficies de UI (dark app shell)
        surface: {
          DEFAULT: "#0F1030",
          raised: "#171838",
          card: "#1B1C42",
          border: "#2A2C55",
        },
      },
      fontFamily: {
        // Titulos / Headlines -> Sora | Texto / Body -> Inter
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-sora)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "demandu-gradient":
          "linear-gradient(120deg, #F64A97 0%, #6E42FF 100%)",
        "demandu-pink": "linear-gradient(135deg, #FF6FB0 0%, #F64A97 100%)",
        "demandu-radial":
          "radial-gradient(120% 120% at 100% 0%, rgba(110,66,255,0.25) 0%, rgba(11,11,79,0) 55%), radial-gradient(120% 120% at 0% 100%, rgba(246,74,151,0.22) 0%, rgba(11,11,79,0) 55%)",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(246,74,151,0.35), 0 8px 30px -8px rgba(246,74,151,0.5)",
        "glow-violet":
          "0 0 0 1px rgba(110,66,255,0.35), 0 8px 30px -8px rgba(110,66,255,0.5)",
        card: "0 10px 40px -12px rgba(0,0,0,0.5)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
