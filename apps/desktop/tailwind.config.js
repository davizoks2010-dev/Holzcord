const c = n => `rgb(var(--c-${n}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {
    fontFamily: {
      sans: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif'],
      display: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif'],
      brand: ['Fraunces', 'Georgia', 'serif'],
      mono: ['Figtree', 'Segoe UI', 'system-ui', 'sans-serif']
    },
    colors: { holz: {
      rail: c('rail'), 50: c('50'), 100: c('100'), 200: c('200'), line: c('line'),
      500: c('500'), 600: c('600'), 900: c('900'), mute: c('mute'), live: c('live'), coral: c('coral'), onaccent: c('onaccent'), warn: c('warn')
    } },
    borderRadius: { leaf: '10px', leafsm: '8px', petal: '10px', petalme: '10px' }
  } },
  plugins: []
}
