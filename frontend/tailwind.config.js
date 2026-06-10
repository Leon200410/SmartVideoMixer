/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        neon: '0 0 24px rgba(168, 85, 247, 0.35)',
        'neon-lg': '0 0 40px rgba(217, 70, 239, 0.45)',
        cyan: '0 0 24px rgba(34, 211, 238, 0.3)',
      },
    },
  },
  plugins: [],
}
