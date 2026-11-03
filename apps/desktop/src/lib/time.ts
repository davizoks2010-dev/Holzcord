const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "Hoje", "Ontem" ou "3 de novembro" (com o ano se for de outro ano). */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return 'Hoje'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Ontem'
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` de ${d.getFullYear()}` : ''}`
}
export const isSameDay = (a: string, b: string) => sameDay(new Date(a), new Date(b))
/** Mensagens seguidas do mesmo autor, em ate 5 minutos, ficam agrupadas. */
export const groupsWith = (prev: { author_id: string; created_at: string } | undefined, cur: { author_id: string; created_at: string }) =>
  !!prev && prev.author_id === cur.author_id && isSameDay(prev.created_at, cur.created_at) && new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
