const c = n => `rgb(var(--c-${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: {
      sans: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif'],
      display: ['Fraunces', 'Georgia', 'serif'],
      mono: ['"JetBrains Mono"', 'Consolas', 'monospace']
    },
    colors: { holz: {
      rail: c('rail'), 50: c('50'), 100: c('100'), 200: c('200'), line: c('line'),
      500: c('500'), 600: c('600'), 900: c('900'), mute: c('mute'), live: c('live'), coral: c('coral'), onaccent: c('onaccent'), warn: c('warn')
    } },
    borderRadius: { leaf: '22px 6px 22px 6px', leafsm: '12px 4px 12px 4px', pebble: '58% 42% 55% 45% / 48% 56% 44% 52%', petal: '4px 18px 18px 18px', petalme: '18px 4px 18px 18px' }
  } },
  plugins: []
}
