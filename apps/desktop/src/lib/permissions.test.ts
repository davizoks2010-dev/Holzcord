import { describe, it, expect } from 'vitest'
import { canManage, groupByRole, permsOf, positionOf } from './permissions'
import type { Member, Role, Server } from './supabase'

const server: Server = { id: 's', name: 'S', invite_code: 'x', owner_id: 'dono' }
const role = (id: string, position: number, perms: string[] = []): Role => ({ id, server_id: 's', name: id, color: '#fff', position, perms })
const roles = [role('Admin', 50, ['kick_members']), role('Membro', 0)]
const mem = (user_id: string, role_id: string | null): Member => ({ server_id: 's', user_id, role_id, profiles: { username: user_id } })
const members = [mem('dono', null), mem('ana', 'Admin'), mem('bia', 'Membro'), mem('cai', null)]

describe('permissoes', () => {
  it('dono tem posicao maxima e todas as permissoes', () => {
    expect(positionOf(server, roles, members, 'dono')).toBe(1000)
    expect(permsOf(server, roles, members, 'dono')).toContain('manage_roles')
  })
  it('membro usa posicao e permissoes do cargo', () => {
    expect(positionOf(server, roles, members, 'ana')).toBe(50)
    expect(permsOf(server, roles, members, 'ana')).toEqual(['kick_members'])
  })
  it('sem cargo = posicao 0 e nenhuma permissao', () => {
    expect(positionOf(server, roles, members, 'cai')).toBe(0)
    expect(permsOf(server, roles, members, 'cai')).toEqual([])
  })
  it('so gerencia quem esta estritamente abaixo', () => {
    expect(canManage(50, 0)).toBe(true)
    expect(canManage(50, 50)).toBe(false)
    expect(canManage(50, 1000)).toBe(false)
  })
  it('agrupa do cargo mais alto ao mais baixo e cria "Sem cargo"', () => {
    const g = groupByRole(roles, members, server)
    expect(g.map(x => x.role.name)).toEqual(['Admin', 'Membro', 'Sem cargo'])
    expect(g[2].members.map(m => m.user_id)).toEqual(['dono', 'cai'])
  })
})
