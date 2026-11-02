import { supabase, type Member, type Role, type Server } from '../../lib/supabase'
import { canManage, groupByRole, positionOf } from '../../lib/permissions'
import Icon from '../../components/Icon'

interface Props { server: Server; roles: Role[]; members: Member[]; online: Set<string>; userId: string; myPos: number; myPerms: string[] }

export default function MembersPanel({ server, roles, members, online, userId, myPos, myPerms }: Props) {
  const groups = groupByRole(roles, members, server)
  const assignable = roles.filter(r => r.position < myPos).sort((a, b) => b.position - a.position)

  async function setRole(uid: string, roleId: string) {
    const { error } = await supabase.from('members').update({ role_id: roleId || null }).eq('server_id', server.id).eq('user_id', uid)
    if (error) alert(error.message)
  }
  async function kick(m: Member) {
    if (!confirm(`Expulsar ${m.profiles?.username ?? 'este membro'} do servidor?`)) return
    const { error } = await supabase.from('members').delete().eq('server_id', server.id).eq('user_id', m.user_id)
    if (error) alert(error.message)
  }

  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-l border-holz-line bg-holz-100 p-3">
      <p className="mb-3 px-1 font-mono text-[11px] uppercase tracking-widest text-holz-mute">
        membros · {members.filter(m => online.has(m.user_id) || m.user_id === userId).length}/{members.length} online
      </p>
      {groups.map(({ role, members: ms }) => (
        <section key={role.id} className="mb-4">
          <h3 className="mb-1 px-1 font-mono text-[11px] uppercase tracking-widest" style={{ color: role.color }}>{role.name} — {ms.length}</h3>
          {ms.sort((a, b) => Number(online.has(b.user_id) || b.user_id === userId) - Number(online.has(a.user_id) || a.user_id === userId)).map(m => {
            const isOn = online.has(m.user_id) || m.user_id === userId
            const target = positionOf(server, roles, members, m.user_id)
            const manageable = m.user_id !== userId && canManage(myPos, target)
            return (
              <div key={m.user_id} className={`group flex items-center gap-2 rounded-leafsm px-2 py-1.5 hover:bg-holz-200 ${isOn ? '' : 'opacity-50'}`}>
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${isOn ? 'bg-holz-live' : 'bg-holz-line'}`} />
                <span className="flex-1 truncate" style={{ color: role.color }}>
                  {m.profiles?.username ?? 'usuário'}{m.user_id === userId && <span className="text-holz-mute"> (você)</span>}
                  {m.user_id === server.owner_id && <span title="Dono"> ♛</span>}
                </span>
                {manageable && myPerms.includes('manage_roles') && (
                  <select title="Cargo" value={m.role_id ?? ''} onChange={e => setRole(m.user_id, e.target.value)}
                    className="hidden w-20 rounded bg-holz-rail text-xs text-holz-900 group-hover:block">
                    <option value="">sem cargo</option>
                    {assignable.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                {manageable && myPerms.includes('kick_members') && (
                  <button title="Expulsar" onClick={() => kick(m)} className="hidden text-holz-coral group-hover:block"><Icon name="out" size={15} /></button>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </aside>
  )
}
