import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

const LABEL: Record<string, string> = {
  channel_create: 'criou o canal', channel_delete: 'apagou o canal', channel_update: 'alterou o canal',
  role_create: 'criou o cargo', role_delete: 'apagou o cargo', role_update: 'alterou o cargo', role_assign: 'atribuiu cargo:',
  member_kick: 'expulsou', member_leave: 'saiu do servidor', member_ban: 'baniu', member_unban: 'desbaniu', timeout: 'silenciou', timeout_remove: 'removeu o silêncio de'
}
interface Entry { id: number; actor_id: string | null; action: string; target: string | null; created_at: string }

export default function AuditDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Entry[] | null>(null); const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    supabase.from('audit_log').select('*').eq('server_id', serverId).order('created_at', { ascending: false }).limit(100).then(async ({ data }) => {
      const list = (data as Entry[]) ?? []; setRows(list)
      const ids = [...new Set(list.map(r => r.actor_id).filter(Boolean))] as string[]
      if (ids.length) { const { data: ps } = await supabase.from('profiles').select('id,username').in('id', ids); setNames(Object.fromEntries((ps ?? []).map(p => [p.id, p.username]))) }
    })
  }, [serverId])
  return (
    <Modal title="Log de auditoria" onClose={onClose} wide>
      <div className="space-y-1.5">
        {rows?.map(r => (
          <div key={r.id} className="flex items-baseline gap-3 rounded-leafsm border border-holz-line bg-holz-50 px-3 py-2 text-sm">
            <span className="w-36 shrink-0 font-mono text-[11px] text-holz-mute">{new Date(r.created_at).toLocaleString()}</span>
            <span><b className="text-holz-500">{names[r.actor_id ?? ''] ?? 'alguém'}</b> {LABEL[r.action] ?? r.action} <b>{r.target}</b></span>
          </div>
        ))}
        {rows && !rows.length && <p className="text-holz-mute">Nenhuma ação registrada ainda.</p>}
        {!rows && <p className="text-holz-mute">Carregando…</p>}
      </div>
    </Modal>
  )
}
