/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Azul marino de la Clínica Josefina Arregui (su propia identidad,
        // no un azul-morado genérico de plantilla). 600 es el tono de
        // marca real; el resto de la escala se construye a partir de él.
        primary: {
          50:  '#EEF2F6',
          100: '#DCE6EE',
          200: '#B9CEDD',
          300: '#8FADC5',
          400: '#5D82A3',
          500: '#3C6084',
          600: '#1E3A5F',
          700: '#17304C',
          800: '#122438',
          900: '#0C1826',
        },
        // El verde del árbol de la clínica. Se reserva para el propio
        // logotipo y momentos muy puntuales: el resto de la app ya usa
        // el verde con un significado clínico concreto (semáforo de
        // caídas), así que no se convierte en color decorativo general.
        brandgreen: {
          500: '#6FA23C',
          600: '#5C8A30',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}

