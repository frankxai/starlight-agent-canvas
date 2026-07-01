import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        starlight: {
          bg: '#05060A',
          surface: '#0A0C14',
          panel: '#111522',
          border: '#1A1F2E',
          ink: '#F1F3F9',
          muted: '#8A90A8',
          accent: '#6EA8FE',
          violet: '#A78BFA',
          gold: '#F5C36A',
          mint: '#79E6C5',
          danger: '#F97066',
        },
      },
      boxShadow: {
        command: '0 1px 0 rgba(255,255,255,0.06) inset, 0 30px 100px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};

export default config;
