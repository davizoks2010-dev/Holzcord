import { supabase } from './supabase'

// Cada sonda tenta ler algo que so existe depois de uma etapa do banco. Se faltar, avisamos o usuario.
const PROBES: { label: string; table: string; column: string }[] = [
  { label: 'banco base', table: 'profiles', column: 'id' },
  { label: 'cargos e canais', table: 'roles', column: 'id' },
  { label: 'mensagens diretas e perfil', table: 'profiles', column: 'status' },
  { label: 'amigos e moderação', table: 'channels', column: 'is_private' },
  { label: 'tópicos e convites', table: 'invites', column: 'code' }
]
const isMissing = (m?: string) => !!m && /does not exist|schema cache|could not find/i.test(m)

/** Devolve os nomes das etapas do banco que ainda nao foram aplicadas (lista vazia = tudo certo). */
export async function checkSchema(): Promise<string[]> {
  const res = await Promise.all(PROBES.map(p => supabase.from(p.table).select(p.column).limit(0)))
  return PROBES.filter((_, i) => isMissing(res[i].error?.message)).map(p => p.label)
}
