import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

interface Ban { user_id: string; reason: string | null; created_at: string; profiles: { username: string } | null }

export default function BansDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [rows, setRows] = useState<Ban[] | null>(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('bans').select('user_id,reason,created_at,profiles!bans_user_id_fkey(username)').eq('server_id', serverId)
    setRows((data as unknown as Ban[]) ?? [])
  }, [serverId])
  useEffect(() => { load() }, [load])
  async function unban(id: string) { const { error } = await supabase.rpc('unban_member', { p_server: serverId, p_user: id }); if (error) alert(error.message); load() }
  return (
    <Modal title="Usuários banidos" onClose={onClose}>
      <div className="space-y-2">
        {rows?.map(b => (
          <div key={b.user_id} className="flex items-center gap-3 rounded-lg border border-holz-line px-3 py-2">
            <div className="min-w-0 flex-1"><div className="font-display font-semibold">{b.profiles?.username ?? 'usuário'}</div>{b.reason && <div className="truncate text-xs text-holz-mute">{b.reason}</div>}</div>
            <button onClick={() => unban(b.user_id)} className="btn border border-holz-line px-3 py-1 text-sm">Desbanir</button>
          </div>
        ))}
        {rows && !rows.length && <p className="text-holz-mute">Ninguém banido.</p>}
      </div>
    </Modal>
  )
}
