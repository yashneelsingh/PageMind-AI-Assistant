/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563eb', // Academic Primary Blue
          dark: '#1d4ed8',
        },
        slate: {
          850: '#1e293b',
          900: '#0f172a',
        }
      }
    },
  },
  plugins: [],
}
