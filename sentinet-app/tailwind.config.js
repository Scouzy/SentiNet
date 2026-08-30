/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          50:  '#e6fff9',
          100: '#b3ffe8',
          200: '#66ffd1',
          300: '#00ffb3',
          400: '#00e5a0',
          500: '#00c98d',
          600: '#00a375',
          700: '#007d5b',
          800: '#005a41',
          900: '#003828',
        },
        sentinel: {
          50:  '#e8f0ff',
          100: '#c0d1ff',
          200: '#91abff',
          300: '#5e82ff',
          400: '#3b5eff',
          500: '#1a3bff',
          600: '#0028e0',
          700: '#001fb0',
          800: '#001680',
          900: '#000d50',
        },
        dark: {
          900: '#050914',
          850: '#080f1f',
          800: '#0a1628',
          750: '#0d1d35',
          700: '#111f38',
          650: '#152540',
          600: '#1a2d4e',
          500: '#1e3460',
          400: '#243c72',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'scan': 'scan 2s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px #00c98d, 0 0 10px #00c98d' },
          '100%': { boxShadow: '0 0 10px #00c98d, 0 0 20px #00c98d, 0 0 40px #00c98d' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      backgroundImage: {
        'grid-pattern': "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300c98d' fill-opacity='0.03'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
