import { useState } from 'react'
import { supabase, type Member, type Server } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

const TIMEOUTS = [[5, '5 minutos'], [60, '1 hora'], [1440, '1 dia'], [10080, '1 semana']] as const
interface Props { server: Server; member: Member; myPerms: string[]; onClose: () => void }

export default function MemberActionsDialog({ server, member, myPerms, onClose }: Props) {
  const name = member.profiles?.username ?? 'membro'
  const [reason, setReason] = useState(''); const [err, setErr] = useState('')
  const timedOut = !!member.timeout_until && new Date(member.timeout_until) > new Date()
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok = true) => { const { error } = await p; if (error) setErr(error.message); else if (ok) onClose() }
  const btn = 'btn w-full justify-start border border-holz-line'
  return (
    <Modal title={name} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3"><Avatar name={name} url={member.profiles?.avatar_url} size={48} />
          {timedOut && <span className="text-sm text-holz-warn">Silenciado até {new Date(member.timeout_until!).toLocaleString()}</span>}</div>
        {myPerms.includes('moderate_members') && (
          <div className="space-y-1.5">
            <p className="font-mono text-[11px] uppercase tracking-widest text-holz-mute">silenciar (timeout)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {TIMEOUTS.map(([m, l]) => <button key={m} className={btn} onClick={() => run(supabase.rpc('timeout_member', { p_server: server.id, p_user: member.user_id, p_minutes: m }))}>{l}</button>)}
            </div>
            {timedOut && <button className={btn} onClick={() => run(supabase.rpc('timeout_member', { p_server: server.id, p_user: member.user_id, p_minutes: 0 }))}>Remover silêncio</button>}
          </div>
        )}
        {myPerms.includes('kick_members') && (
          <button className={`${btn} text-holz-coral`} onClick={() => confirm(`Expulsar ${name}?`) && run(supabase.from('members').delete().eq('server_id', server.id).eq('user_id', member.user_id))}>Expulsar do servidor</button>
        )}
        {myPerms.includes('ban_members') && (
          <div className="space-y-1.5">
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Motivo do banimento (opcional)"
              className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2 text-sm outline-none focus:border-holz-500" />
            <button className={`${btn} text-holz-coral`} onClick={() => confirm(`Banir ${name}? Ele não poderá voltar pelo convite.`) && run(supabase.rpc('ban_member', { p_server: server.id, p_user: member.user_id, p_reason: reason }))}>Banir</button>
          </div>
        )}
        {err && <p className="text-sm text-holz-coral">{err}</p>}
      </div>
    </Modal>
  )
}
