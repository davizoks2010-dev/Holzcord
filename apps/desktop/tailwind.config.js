export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: {
      sans: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif'],
      display: ['Fraunces', 'Georgia', 'serif'],
      mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
    },
    colors: { holz: {
      rail: '#090C0A', 50: '#0C100E', 100: '#121714', 200: '#1A211D', line: '#26302A',
      500: '#C8F169', 600: '#B5E24F', 900: '#EAF0E6', mute: '#8E9A92', live: '#7EE8A8', coral: '#FF7A66'
    } },
    borderRadius: { leaf: '22px 6px 22px 6px', leafsm: '12px 4px 12px 4px', pebble: '58% 42% 55% 45% / 48% 56% 44% 52%', petal: '4px 18px 18px 18px', petalme: '18px 4px 18px 18px' }
  } },
  plugins: []
}
