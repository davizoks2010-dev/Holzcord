import { useState } from 'react'
import { supabase, type Server } from '../../lib/supabase'
import Modal from '../../components/Modal'

interface Props { server: Server; canManage: boolean; isOwner: boolean; onChanged: (s?: Server) => void; onDeleted: () => void; onClose: () => void }

export default function ServerSettingsDialog({ server, canManage, isOwner, onChanged, onDeleted, onClose }: Props) {
  const [name, setName] = useState(server.name); const [code, setCode] = useState(server.invite_code); const [err, setErr] = useState('')
  const field = 'w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500 disabled:opacity-50'

  async function rename() {
    setErr('')
    const { error } = await supabase.from('servers').update({ name: name.trim() }).eq('id', server.id)
    if (error) return setErr(error.message)
    onChanged({ ...server, name: name.trim(), invite_code: code })
  }
  async function regen() {
    setErr('')
    const { data, error } = await supabase.rpc('regen_invite', { p_server: server.id })
    if (error) return setErr(error.message)
    setCode(data as string); onChanged({ ...server, name: name.trim() || server.name, invite_code: data as string })
  }
  async function remove() {
    if (!confirm(`Apagar o servidor "${server.name}" para sempre? Canais e mensagens serão perdidos.`)) return
    const { error } = await supabase.from('servers').delete().eq('id', server.id)
    if (error) return setErr(error.message)
    onDeleted()
  }
  return (
    <Modal title="Configurações do servidor" onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-sm text-holz-mute">Nome</label>
        <div className="flex gap-2">
          <input disabled={!canManage} value={name} maxLength={100} onChange={e => setName(e.target.value)} className={field} />
          <button disabled={!canManage || !name.trim() || name === server.name} onClick={rename} className="btn bg-holz-500 text-holz-rail disabled:opacity-40">Salvar</button>
        </div>
        <label className="block text-sm text-holz-mute">Código de convite</label>
        <div className="flex gap-2">
          <code className="flex-1 select-all rounded-leafsm border border-dashed border-holz-line p-2.5 font-mono text-holz-500">{code}</code>
          <button disabled={!canManage} onClick={regen} className="btn border border-holz-line disabled:opacity-40">Gerar novo</button>
        </div>
        {!canManage && <p className="text-sm text-holz-mute">Você não tem a permissão "Gerenciar servidor".</p>}
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        {isOwner && <button onClick={remove} className="btn mt-2 w-full justify-center border border-holz-coral text-holz-coral">Apagar servidor</button>}
      </div>
    </Modal>
  )
}
