import { useState } from 'react'
import { supabase, type Server } from '../../lib/supabase'
import Modal from '../../components/Modal'
import Avatar from '../../components/Avatar'

interface Props { server: Server; canManage: boolean; canBan: boolean; canAudit: boolean; onOpen: (k: 'audit' | 'bans') => void; isOwner: boolean; onChanged: (s?: Server) => void; onDeleted: () => void; onClose: () => void }

export default function ServerSettingsDialog({ server, canManage, canBan, canAudit, onOpen, isOwner, onChanged, onDeleted, onClose }: Props) {
  const [hours, setHours] = useState(24); const [uses, setUses] = useState(0); const [temp, setTemp] = useState('')
  const [name, setName] = useState(server.name); const [code, setCode] = useState(server.invite_code); const [err, setErr] = useState('')
  const field = 'w-full rounded-lg border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500 disabled:opacity-50'

  async function rename() {
    setErr('')
    const { error } = await supabase.from('servers').update({ name: name.trim() }).eq('id', server.id)
    if (error) return setErr(error.message)
    onChanged({ ...server, name: name.trim(), invite_code: code })
  }
  async function icon(file: File) {
    if (file.size > 2_000_000) return setErr('O ícone deve ter até 2 MB.')
    const path = `server-icons/${server.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const up = await supabase.storage.from('attachments').upload(path, file)
    if (up.error) return setErr(up.error.message)
    const url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
    const { error } = await supabase.from('servers').update({ icon_url: url }).eq('id', server.id)
    if (error) return setErr(error.message)
    onChanged({ ...server, icon_url: url, name: name.trim() || server.name, invite_code: code })
  }
  async function newInvite() {
    setErr('')
    const { data, error } = await supabase.rpc('create_invite', { p_server: server.id, p_hours: hours, p_max_uses: uses })
    if (error) return setErr(error.message)
    setTemp(data as string)
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
        <div className="flex items-center gap-3">
          <Avatar name={server.name} url={server.icon_url} size={56} />
          <label className={`btn border border-holz-line ${canManage ? 'cursor-pointer' : 'opacity-40'}`}>Trocar ícone
            <input type="file" accept="image/*" hidden disabled={!canManage} onChange={e => e.target.files?.[0] && icon(e.target.files[0])} />
          </label>
        </div>
        <label className="block text-sm text-holz-mute">Nome</label>
        <div className="flex gap-2">
          <input disabled={!canManage} value={name} maxLength={100} onChange={e => setName(e.target.value)} className={field} />
          <button disabled={!canManage || !name.trim() || name === server.name} onClick={rename} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-40">Salvar</button>
        </div>
        <label className="block text-sm text-holz-mute">Código de convite</label>
        <div className="flex gap-2">
          <code className="flex-1 select-all rounded-lg border border-holz-line p-2.5 text-holz-500">{code}</code>
          <button disabled={!canManage} onClick={regen} className="btn border border-holz-line disabled:opacity-40">Gerar novo</button>
        </div>
        <label className="block text-sm text-holz-mute">Convite temporário</label>
        <div className="flex gap-2">
          <select value={hours} onChange={e => setHours(Number(e.target.value))} className="field"><option value={1}>Expira em 1 hora</option><option value={24}>Expira em 1 dia</option><option value={168}>Expira em 7 dias</option><option value={0}>Nunca expira</option></select>
          <select value={uses} onChange={e => setUses(Number(e.target.value))} className="field"><option value={1}>1 uso</option><option value={5}>5 usos</option><option value={25}>25 usos</option><option value={0}>Usos ilimitados</option></select>
        </div>
        <div className="flex gap-2">
          <code className="flex-1 select-all rounded-lg border border-holz-line p-2.5 text-holz-500">{temp || 'Clique em "Criar convite"'}</code>
          <button onClick={newInvite} className="btn border border-holz-line">Criar convite</button>
        </div>
        {!canManage && <p className="text-sm text-holz-mute">Você não tem a permissão "Gerenciar servidor".</p>}
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        {(canAudit || canBan) && (
          <div className="flex gap-2">
            {canAudit && <button onClick={() => onOpen('audit')} className="btn flex-1 justify-center border border-holz-line">Log de auditoria</button>}
            {canBan && <button onClick={() => onOpen('bans')} className="btn flex-1 justify-center border border-holz-line">Banidos</button>}
          </div>
        )}
        {isOwner && <button onClick={remove} className="btn mt-2 w-full justify-center border border-holz-coral text-holz-coral">Apagar servidor</button>}
      </div>
    </Modal>
  )
}
