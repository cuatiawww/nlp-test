import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#0060A9",
          dark: "#004b85",
          light: "#1a78c2",
        },
        secondary: {
          DEFAULT: "#B49B58",
          dark: "#968045",
          light: "#cfb97c",
        },
        accent: {
          DEFAULT: "#ED2939",
          dark: "#c61f2d",
          light: "#f15462",
        },
        asean: {
          blue: "#0060A9",
          red: "#ED2939",
          gold: "#B49B58",
          sky: "#0284c7",
        },
      },
      fontFamily: {
        manrope: ["var(--font-roboto)", "sans-serif"],
        roboto: ["var(--font-roboto)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
