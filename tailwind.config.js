/** @type {import('tailwindcss').Config} */

// Minimalist Brown: cream (พื้นหลัง) → beige/sand (พื้นผิวรอง) → mocha/walnut (แบรนด์) → espresso (ตัวอักษร)
const walnut = {
  50: '#F6EFE9', 100: '#EADBCD', 200: '#D5B9A0', 300: '#BE9573', 400: '#A87850',
  500: '#8B5E3C', 600: '#744C2F', 700: '#5E3D26', 800: '#4A301F', 900: '#3A2518',
};
const sand = { 100: '#F3EBDD', 200: '#E6D5BA', 300: '#D4BC96', 400: '#C4A57A', 500: '#B08D5E' };

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: { 50: '#FDFBF7', 100: '#F8F3EA', 200: '#F0E8DA' },
        walnut,
        mocha: walnut,
        sand,
        beige: sand,
        espresso: { 900: '#2B1D14', 800: '#3A2A1F', 700: '#4E3B2E', 500: '#7A6455', 300: '#A8978A' },
        success: { DEFAULT: '#5B7F4F', soft: '#E6EFE2' },
        warning: { DEFAULT: '#B7791F', soft: '#F8EBD0' },
        danger: { DEFAULT: '#A64B3C', soft: '#F6E1DD' },
        info: { DEFAULT: '#5A7184', soft: '#E3EAF0' },
        line: '#E2D6C4',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Noto Sans Thai"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: { card: '14px' },
      boxShadow: {
        soft: '0 1px 2px rgba(58,37,24,0.04), 0 4px 16px rgba(58,37,24,0.06)',
        lift: '0 8px 28px rgba(58,37,24,0.12)',
      },
      keyframes: {
        flash: { '0%': { backgroundColor: '#F8EBD0' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: { flash: 'flash 1.2s ease-out' },
    },
  },
  plugins: [],
};
