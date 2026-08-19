import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6C5CE7',
        'primary-dark': '#5A4BD1',
      },
    },
  },
  plugins: [],
};

export default config;
