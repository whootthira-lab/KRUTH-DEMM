/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#1A3A5C', light: '#2E75B6', dark: '#0D1F33' },
        accent: { gold: '#E8A020', green: '#2E7D32', purple: '#6A1B9A', orange: '#E65100' },
      },
      fontFamily: { thai: ['Sarabun', 'sans-serif'] },
    },
  },
  plugins: [],
};
