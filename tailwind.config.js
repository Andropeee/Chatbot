/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'five-red':   '#E63B3B',
        'five-red-dark': '#C42F2F',
        'five-black': '#0d0d0d',
        'five-gray':  '#1a1a1a',
      },
    },
  },
  plugins: [],
}
