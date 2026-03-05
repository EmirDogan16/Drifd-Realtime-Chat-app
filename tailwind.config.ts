import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        drifd: {
          primary: '#6F58F2',
          link: '#00AFF4',
          bg: '#202225',
          secondary: '#2F3136',
          tertiary: '#36393F',
          hover: '#40444B',
          divider: '#2D2F32',
          text: '#dcddde',
          muted: '#72767d',
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
