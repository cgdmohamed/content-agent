import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Alexandria", "Tajawal", "Arial", "sans-serif"]
      },
      colors: {
        ink: "#17202a",
        mist: "#f4f7f8",
        teal: "#0f766e",
        saffron: "#b7791f",
        berry: "#9f1239"
      }
    }
  },
  plugins: []
} satisfies Config;
