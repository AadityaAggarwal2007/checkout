import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#EEF4FF', 100: '#DCE7FE', 500: '#3B6CF6', 600: '#2558E8', 700: '#1D46C5' },
        ink: { DEFAULT: '#18181B', 2: '#52525B', 3: '#71717A', line: '#E4E4E7', soft: '#F4F4F5' },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)' },
    },
  },
  plugins: [],
} satisfies Config;
