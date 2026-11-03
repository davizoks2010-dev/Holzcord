import { useEffect, useState } from 'react'
import { supabase, type Message } from '../../lib/supabase'
import { notify } from '../../lib/toast'
import Modal from '../../components/Modal'
import { useDMs } from '../dm/useDMs'

interface Target { id: string; label: string }

export default function ForwardDialog({ message, userId, onClose }: { message: Message; userId: string; onClose: () => void }) {
  const [targets, setTargets] = useState<Target[]>([]); const { dms } = useDMs(userId); const [q, setQ] = useState('')
  useEffect(() => {
    Promise.all([supabase.from('channels').select('id,name,server_id,type,is_thread').eq('type', 'text'), supabase.from('servers').select('id,name')]).then(([c, s]) => {
      const names = new Map((s.data ?? []).map(x => [x.id as string, x.name as string]))
      setTargets((c.data ?? []).filter(x => !x.is_thread).map(x => ({ id: x.id as string, label: `${names.get(x.server_id as string) ?? 'Servidor'} › #${x.name}` })))
    })
  }, [])
  const all = [...targets, ...dms.map(d => ({ id: d.channel.id, label: `Conversa › ${d.channel.name}` }))].filter(t => t.label.toLowerCase().includes(q.toLowerCase()))
  async function send(t: Target) {
    const who = message.profiles?.username ?? 'alguém'
    const { error } = await supabase.from('messages').insert({ channel_id: t.id, author_id: userId, content: `↪ Encaminhada de ${who}:\n${message.content}`, attachment_url: message.attachment_url ?? null })
    if (error) notify(error.code === '42501' ? 'Não foi possível enviar para esse destino agora.' : error.message)
    else { notify('Mensagem encaminhada.', 'ok'); onClose() }
  }
  return (
    <Modal title="Encaminhar mensagem" onClose={onClose}>
      <div className="mb-3 truncate rounded-lg border-l-4 border-holz-line bg-holz-50 px-3 py-2 text-sm text-holz-mute">{message.content}</div>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Procurar canal ou conversa" className="field mb-2" />
      <div className="max-h-64 space-y-0.5 overflow-y-auto">
        {all.map(t => <button key={t.id} onClick={() => send(t)} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-holz-200">{t.label}</button>)}
        {!all.length && <p className="text-sm text-holz-mute">Nenhum destino encontrado.</p>}
      </div>
    </Modal>
  )
}
