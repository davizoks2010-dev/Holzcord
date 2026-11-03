import { supabase, type Member, type Role, type Server } from '../../lib/supabase'
import { canManage, groupByRole, positionOf, roleColor } from '../../lib/permissions'
import Icon from '../../components/Icon'
import Avatar from '../../components/Avatar'

interface Props { server: Server; roles: Role[]; members: Member[]; online: Set<string>; statuses: Record<string, string>; userId: string; myPos: number; myPerms: string[]; onDM: (uid: string) => void; onActions: (m: Member) => void }

export default function MembersPanel({ server, roles, members, online, statuses, userId, myPos, myPerms, onDM, onActions }: Props) {
  const groups = groupByRole(roles, members, server)
  const assignable = roles.filter(r => r.position < myPos).sort((a, b) => b.position - a.position)

  async function setRole(uid: string, roleId: string) {
    const { error } = await supabase.from('members').update({ role_id: roleId || null }).eq('server_id', server.id).eq('user_id', uid)
    if (error) alert(error.message)
  }
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-l border-holz-line bg-holz-100 p-3">
      <p className="mb-3 px-1 text-xs font-semibold text-holz-mute">
        membros · {members.filter(m => online.has(m.user_id) || m.user_id === userId).length}/{members.length} online
      </p>
      {groups.map(({ role, members: ms }) => (
        <section key={role.id} className="mb-4">
          <h3 className="mb-1 px-1 text-xs font-semibold" style={{ color: roleColor(role.color) }}>{role.name} — {ms.length}</h3>
          {ms.sort((a, b) => Number(online.has(b.user_id) || b.user_id === userId) - Number(online.has(a.user_id) || a.user_id === userId)).map(m => {
            const isOn = online.has(m.user_id) || m.user_id === userId
            const target = positionOf(server, roles, members, m.user_id)
            const manageable = m.user_id !== userId && canManage(myPos, target)
            return (
              <div key={m.user_id} className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-holz-200 ${isOn ? '' : 'opacity-50'}`}>
                <Avatar name={m.profiles?.username ?? '?'} url={m.profiles?.avatar_url} size={24} />
                <span title={statuses[m.user_id] ?? ''} className={`-ml-3 mt-4 h-2.5 w-2.5 shrink-0 rounded-full border border-holz-100 ${!isOn ? 'bg-holz-line' : (statuses[m.user_id] === 'dnd' ? 'bg-holz-coral' : statuses[m.user_id] === 'idle' ? 'bg-holz-warn' : 'bg-holz-live')}`} />
                <span className="flex-1 truncate" style={{ color: roleColor(role.color) }}>
                  {m.profiles?.username ?? 'usuário'}{m.user_id === userId && <span className="text-holz-mute"> (você)</span>}
                  {m.user_id === server.owner_id && <span title="Dono do servidor" className="ml-1 inline-block align-middle text-holz-warn"><Icon name="crown" size={13} /></span>}{m.timeout_until && new Date(m.timeout_until) > new Date() && <span title="Silenciado" className="ml-1 inline-block align-middle text-holz-warn"><Icon name="clock" size={13} /></span>}
                </span>
                {m.user_id !== userId && <button title="Enviar mensagem" onClick={() => onDM(m.user_id)} className="hidden text-holz-mute hover:text-holz-500 group-hover:block"><Icon name="dm" size={15} /></button>}
                {manageable && myPerms.includes('manage_roles') && (
                  <select title="Cargo" value={m.role_id ?? ''} onChange={e => setRole(m.user_id, e.target.value)}
                    className="hidden w-20 rounded bg-holz-rail text-xs text-holz-900 group-hover:block">
                    <option value="">sem cargo</option>
                    {assignable.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                )}
                {manageable && ['kick_members', 'ban_members', 'moderate_members'].some(p => myPerms.includes(p)) && (
                  <button title="Moderar" onClick={() => onActions(m)} className="hidden text-holz-coral group-hover:block"><Icon name="gear" size={15} /></button>
                )}
              </div>
            )
          })}
        </section>
      ))}
    </aside>
  )
}
