/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "padel-green": "#39E55F", // A vibrant neon green typical of padel courts
        "padel-blue": "#0F4C81",
      },
    },
  },
  plugins: [],
};
