import { useEffect, useState } from 'react'
import { supabase, type Profile } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

interface Props { userId: string; onOpen: (otherId: string) => Promise<string | null>; onGroup: (ids: string[], name: string) => Promise<string | null>; onClose: () => void }

export default function NewDmDialog({ userId, onOpen, onGroup, onClose }: Props) {
  const [q, setQ] = useState(''); const [list, setList] = useState<Profile[]>([]); const [err, setErr] = useState('')
  const [picked, setPicked] = useState<Profile[]>([]); const [groupName, setGroupName] = useState('')
  useEffect(() => {
    const like = q.trim().replace(/[\\%_]/g, c => '\\' + c)
    const t = setTimeout(async () => {
      const base = supabase.from('profiles').select('id,username,avatar_url,about,status').neq('id', userId).limit(12)
      const { data } = await (like ? base.ilike('username', `%${like}%`) : base)
      setList((data as Profile[]) ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [q, userId])
  const toggle = (p: Profile) => setPicked(x => x.some(y => y.id === p.id) ? x.filter(y => y.id !== p.id) : [...x, p])
  async function create() {
    const e = await onGroup(picked.map(p => p.id), groupName); if (e) setErr(e); else onClose()
  }
  return (
    <Modal title="Nova conversa" onClose={onClose}>
      <p className="mb-2 text-xs text-holz-mute">Clique para abrir uma conversa. Para criar um grupo, marque 2 ou mais pessoas.</p>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar usuário pelo nome"
        className="mb-3 w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
      {err && <p className="mb-2 text-sm text-holz-coral">{err}</p>}
      <div className="max-h-60 space-y-1 overflow-y-auto">
        {list.map(p => (
          <div key={p.id} className="flex items-center gap-2 rounded-leafsm px-2 py-1.5 hover:bg-holz-200">
            <input type="checkbox" checked={picked.some(x => x.id === p.id)} onChange={() => toggle(p)} className="accent-holz-500" />
            <button className="flex flex-1 items-center gap-3 text-left" onClick={async () => { const e = await onOpen(p.id); if (e) setErr(e); else onClose() }}>
              <Avatar name={p.username} url={p.avatar_url} size={30} /><span>{p.username}</span>
            </button>
          </div>
        ))}
        {!list.length && <p className="text-sm text-holz-mute">Nenhum usuário encontrado.</p>}
      </div>
      {picked.length >= 2 && (
        <div className="mt-3 space-y-2 border-t border-holz-line pt-3">
          <input value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={50} placeholder="Nome do grupo (opcional)"
            className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
          <button onClick={create} className="btn w-full justify-center bg-holz-500 text-holz-onaccent">Criar grupo com {picked.length} pessoas</button>
        </div>
      )}
    </Modal>
  )
}
