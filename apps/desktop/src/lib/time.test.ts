import { describe, it, expect } from 'vitest'
import { dayLabel, groupsWith } from './time'

const now = new Date('2026-11-03T15:00:00')
describe('dayLabel', () => {
  it('hoje', () => expect(dayLabel('2026-11-03T08:00:00', now)).toBe('Hoje'))
  it('ontem', () => expect(dayLabel('2026-11-02T23:59:00', now)).toBe('Ontem'))
  it('data antiga no mesmo ano', () => expect(dayLabel('2026-03-09T10:00:00', now)).toBe('9 de março'))
  it('outro ano mostra o ano', () => expect(dayLabel('2025-12-25T10:00:00', now)).toBe('25 de dezembro de 2025'))
})
describe('groupsWith', () => {
  const a = { author_id: 'x', created_at: '2026-11-03T10:00:00' }
  it('agrupa o mesmo autor em poucos minutos', () => expect(groupsWith(a, { author_id: 'x', created_at: '2026-11-03T10:03:00' })).toBe(true))
  it('nao agrupa apos 5 minutos', () => expect(groupsWith(a, { author_id: 'x', created_at: '2026-11-03T10:06:00' })).toBe(false))
  it('nao agrupa autores diferentes', () => expect(groupsWith(a, { author_id: 'y', created_at: '2026-11-03T10:01:00' })).toBe(false))
  it('nao agrupa a primeira mensagem', () => expect(groupsWith(undefined, a)).toBe(false))
})
