import { describe, it, expect } from 'vitest'
import { renderMarkdown } from './format'

describe('renderMarkdown', () => {
  it('escapa HTML', () => expect(renderMarkdown('<script>x</script>')).not.toContain('<script>'))
  it('negrito', () => expect(renderMarkdown('**a**')).toBe('<strong>a</strong>'))
  it('links com rel seguro', () => expect(renderMarkdown('https://a.com')).toContain('noopener'))
})
