import { describe, it, expect } from 'vitest'
import { mentionsUser, renderMarkdown } from './format'

describe('renderMarkdown', () => {
  it('escapa HTML', () => expect(renderMarkdown('<script>x</script>')).not.toContain('<script>'))
  it('negrito', () => expect(renderMarkdown('**a**')).toBe('<strong>a</strong>'))
  it('links com rel seguro', () => expect(renderMarkdown('https://a.com')).toContain('noopener'))
  it('destaca mencoes', () => expect(renderMarkdown('oi @ana!')).toContain('>@ana</span>'))
  it('bloco de codigo', () => expect(renderMarkdown('```x = 1```')).toContain('<pre'))
  it('nao injeta HTML pela mencao', () => expect(renderMarkdown('@<img src=x>')).not.toContain('<img'))
})

describe('mentionsUser', () => {
  it('detecta mencao direta, sem diferenciar maiusculas', () => expect(mentionsUser('oi @Ana', 'ana')).toBe(true))
  it('detecta @everyone', () => expect(mentionsUser('@everyone reuniao', 'bia')).toBe(true))
  it('nao confunde prefixos', () => expect(mentionsUser('oi @ana2', 'ana')).toBe(false))
  it('aceita nomes com caracteres especiais', () => expect(mentionsUser('oi @a.b', 'a.b')).toBe(true))
  it('sem mencao', () => expect(mentionsUser('ola', 'ana')).toBe(false))
})
