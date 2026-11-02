import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

export default function NewDmDialog({ userId, onOpen, onClose }: { userId: string; onOpen: (otherId: string) => Promise<string | null>; onClose: () => void }) {
  const [q, setQ] = useState(''); const [list, setList] = useState<Profile[]>([]); const [err, setErr] = useState('')
  useEffect(() => {
    const like = q.trim().replace(/[\\%_]/g, c => '\\' + c)
    const t = setTimeout(async () => {
      const base = supabase.from('profiles').select('id,username,avatar_url,about,status').neq('id', userId).limit(12)
      const { data } = await (like ? base.ilike('username', `%${like}%`) : base)
      setList((data as Profile[]) ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [q, userId])
  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuário pelo nome"
        className="mb-3 w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
      {err && <p className="mb-2 text-sm text-holz-coral">{err}</p>}
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {list.map(p => (
          <button key={p.id} onClick={async () => { const e = await onOpen(p.id); if (e) setErr(e); else onClose() }}
            className="flex w-full items-center gap-3 rounded-leafsm px-2 py-2 text-left hover:bg-holz-200">
            <Avatar name={p.username} url={p.avatar_url} size={32} /><span>{p.username}</span>
          </button>
        ))}
        {!list.length && <p className="text-sm text-holz-mute">Nenhum usuário encontrado.</p>}
      </div>
    </Modal>
  )
}
