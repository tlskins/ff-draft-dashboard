/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      gridTemplateColumns: {
        '14': 'repeat(14, minmax(0, 1fr))',
      },
      maxHeight: {
        '685': '685px',
      },
      minWidth: {
        '900': '900px',
      },
    },
  },
  plugins: [],
}