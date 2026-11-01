export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: { sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'system-ui', 'sans-serif'] },
    colors: { holz: {
      rail: '#0D0E12', 50: '#101217', 100: '#14161B', 200: '#1B1E25', line: '#262A33',
      500: '#8B7CFF', 600: '#7A69FF', 900: '#ECEEF3', mute: '#8B91A1', live: '#3DDC97', coral: '#FF5C7A'
    } }
  } },
  plugins: []
}
