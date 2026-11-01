export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: { sans: ['"Plus Jakarta Sans"', 'Segoe UI', 'system-ui', 'sans-serif'] },
    colors: { holz: { 50: '#F7F8FC', 100: '#EFF1FA', 200: '#E3E6F4', 500: '#4F46E5', 600: '#4338CA', 900: '#1B1B3A', violet: '#7C5CFF', live: '#2DD4BF', coral: '#F0647A', line: '#DDE0F0' } }
  } },
  plugins: []
}
