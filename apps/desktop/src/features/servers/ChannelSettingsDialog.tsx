import { useEffect, useState } from 'react'
import { supabase, type Category, type Channel, type Role } from '../../lib/supabase'
import Modal from '../../components/Modal'
import { roleColor } from '../../lib/permissions'

const SLOW = [[0, 'Desligado'], [5, '5 s'], [10, '10 s'], [30, '30 s'], [60, '1 min'], [300, '5 min'], [3600, '1 h']] as const
interface Props { channel: Channel; categories: Category[]; roles: Role[]; onClose: () => void }

export default function ChannelSettingsDialog({ channel, categories, roles, onClose }: Props) {
  const [name, setName] = useState(channel.name); const [topic, setTopic] = useState(channel.topic ?? '')
  const [slow, setSlow] = useState(channel.slowmode_seconds ?? 0); const [cat, setCat] = useState(channel.category_id ?? '')
  const [priv, setPriv] = useState(!!channel.is_private); const [allowed, setAllowed] = useState<string[]>([])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const field = 'w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500'

  useEffect(() => { supabase.from('channel_roles').select('role_id').eq('channel_id', channel.id).then(({ data }) => setAllowed((data ?? []).map(r => r.role_id as string))) }, [channel.id])

  async function save() {
    setBusy(true); setErr('')
    const patch: Record<string, unknown> = { name: name.trim() || channel.name, category_id: cat || null, is_private: priv }
    if (channel.type === 'text') { patch.topic = topic.trim() || null; patch.slowmode_seconds = slow }
    const { error } = await supabase.from('channels').update(patch).eq('id', channel.id)
    if (error) { setBusy(false); return setErr(error.message) }
    await supabase.from('channel_roles').delete().eq('channel_id', channel.id)
    if (priv && allowed.length) {
      const { error: e2 } = await supabase.from('channel_roles').insert(allowed.map(role_id => ({ channel_id: channel.id, role_id })))
      if (e2) { setBusy(false); return setErr(e2.message) }
    }
    setBusy(false); onClose()
  }
  async function remove() {
    if (!confirm(`Apagar o canal "${channel.name}" e todas as mensagens dele?`)) return
    const { error } = await supabase.from('channels').delete().eq('id', channel.id)
    if (error) setErr(error.message); else onClose()
  }
  return (
    <Modal title={`Canal · ${channel.name}`} onClose={onClose}>
      <div className="space-y-3">
        <input value={name} maxLength={100} onChange={e => setName(e.target.value)} className={field} placeholder="Nome" />
        {channel.type === 'text' && <>
          <input value={topic} maxLength={200} onChange={e => setTopic(e.target.value)} className={field} placeholder="Tópico do canal (opcional)" />
          <label className="block text-sm text-holz-mute">Modo lento (tempo mínimo entre mensagens)</label>
          <select value={slow} onChange={e => setSlow(Number(e.target.value))} className={field}>{SLOW.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </>}
        <label className="block text-sm text-holz-mute">Categoria</label>
        <select value={cat} onChange={e => setCat(e.target.value)} className={field}>
          <option value="">Sem categoria</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={priv} onChange={e => setPriv(e.target.checked)} className="accent-holz-500" /> Canal privado (só cargos escolhidos)</label>
        {priv && (
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-leafsm border border-holz-line p-2">
            {roles.sort((a, b) => b.position - a.position).map(r => (
              <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={allowed.includes(r.id)} className="accent-holz-500"
                  onChange={() => setAllowed(a => a.includes(r.id) ? a.filter(x => x !== r.id) : [...a, r.id])} />
                <span style={{ color: roleColor(r.color) }}>{r.name}</span>
              </label>
            ))}
            <p className="pt-1 text-xs text-holz-mute">Quem gerencia canais sempre vê o canal.</p>
          </div>
        )}
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={remove} className="px-3 text-holz-coral">Apagar canal</button><span className="flex-1" />
          <button onClick={onClose} className="px-3 text-holz-mute">Cancelar</button>
          <button disabled={busy} onClick={save} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </Modal>
  )
}
