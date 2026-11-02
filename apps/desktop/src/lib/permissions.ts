import type { Member, Role, Server } from './supabase'

export const PERMS = [
  { key: 'manage_channels', label: 'Gerenciar canais', hint: 'Criar e apagar canais de texto e voz' },
  { key: 'manage_roles', label: 'Gerenciar cargos', hint: 'Criar cargos e atribuí-los a quem está abaixo' },
  { key: 'manage_messages', label: 'Gerenciar mensagens', hint: 'Apagar mensagens de outros' },
  { key: 'kick_members', label: 'Expulsar membros', hint: 'Remover quem está abaixo do seu cargo' },
  { key: 'manage_server', label: 'Gerenciar servidor', hint: 'Alterar nome, ícone e convite do servidor' },
  { key: 'ban_members', label: 'Banir membros', hint: 'Banir e desbanir quem está abaixo do seu cargo' },
  { key: 'moderate_members', label: 'Silenciar membros', hint: 'Aplicar timeout em quem está abaixo do seu cargo' },
  { key: 'view_audit_log', label: 'Ver log de auditoria', hint: 'Ver o histórico de ações de moderação' }
] as const
export type PermKey = (typeof PERMS)[number]['key']
export const OWNER_POSITION = 1000

export function positionOf(server: Server, roles: Role[], members: Member[], userId: string): number {
  if (server.owner_id === userId) return OWNER_POSITION
  const m = members.find(x => x.user_id === userId)
  return roles.find(r => r.id === m?.role_id)?.position ?? 0
}

export function permsOf(server: Server, roles: Role[], members: Member[], userId: string): string[] {
  if (server.owner_id === userId) return PERMS.map(p => p.key)
  const m = members.find(x => x.user_id === userId)
  return roles.find(r => r.id === m?.role_id)?.perms ?? []
}

/** Regra de hierarquia: so e possivel gerenciar quem (ou o que) esta ESTRITAMENTE abaixo. */
export const canManage = (myPos: number, targetPos: number) => targetPos < myPos

/** Agrupa membros por cargo, do mais alto para o mais baixo. */
export function groupByRole(roles: Role[], members: Member[], server: Server) {
  const sorted = [...roles].sort((a, b) => b.position - a.position)
  const groups = sorted.map(r => ({ role: r, members: members.filter(m => m.role_id === r.id) }))
  const orphans = members.filter(m => !roles.some(r => r.id === m.role_id))
  if (orphans.length) groups.push({ role: { id: 'none', server_id: server.id, name: 'Sem cargo', color: '#8E9A92', position: -1, perms: [] }, members: orphans })
  return groups.filter(g => g.members.length)
}

/** Cor de cargo legivel nos dois temas (no claro, escurece a cor escolhida). */
export const roleColor = (hex: string) => `color-mix(in srgb, ${hex} var(--role-mix), black)`
