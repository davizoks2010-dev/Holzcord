import { useState } from 'react'
import { supabase, type Role, type Server } from '../../lib/supabase'
import { PERMS, canManage } from '../../lib/permissions'
import Modal from '../../components/Modal'
import Icon from '../../components/Icon'

interface Props { server: Server; roles: Role[]; myPos: number; myPerms: string[]; onClose: () => void }

export default function RolesDialog({ server, roles, myPos, myPerms, onClose }: Props) {
  const sorted = [...roles].sort((a, b) => b.position - a.position)
  const [selId, setSelId] = useState<string | undefined>(sorted.find(r => canManage(myPos, r.position))?.id ?? sorted[0]?.id)
  const sel = roles.find(r => r.id === selId)
  const [draft, setDraft] = useState<Role | null>(null)
  const cur = draft && draft.id === sel?.id ? draft : sel
  const editable = !!cur && canManage(myPos, cur.position)
  const [err, setErr] = useState('')

  const field = 'rounded-lg border border-holz-line bg-holz-200 p-2 outline-none focus:border-holz-500 disabled:opacity-50'
  const patch = (p: Partial<Role>) => cur && setDraft({ ...cur, ...p })

  async function create() {
    setErr('')
    const position = Math.max(0, myPos - 1)
    const { data, error } = await supabase.from('roles').insert({ server_id: server.id, name: 'Novo cargo', color: '#7EE8A8', position, perms: [] }).select().single()
    if (error) return setErr(error.message)
    setSelId((data as Role).id); setDraft(null)
  }
  async function save() {
    if (!cur) return; setErr('')
    const { error } = await supabase.from('roles').update({ name: cur.name.trim(), color: cur.color, perms: cur.perms }).eq('id', cur.id)
    if (error) setErr(error.message); else setDraft(null)
  }
  async function remove() {
    if (!cur || !confirm(`Apagar o cargo "${cur.name}"? Quem o tem ficará sem cargo.`)) return
    const { error } = await supabase.from('roles').delete().eq('id', cur.id)
    if (error) setErr(error.message); else { setSelId(sorted.find(r => r.id !== cur.id && canManage(myPos, r.position))?.id); setDraft(null) }
  }
  // dir = 1 sobe, -1 desce. Troca de posicao com o vizinho; se tiverem a mesma posicao, afasta um degrau.
  async function move(dir: 1 | -1) {
    if (!cur) return; setErr('')
    const neighbor = sorted[sorted.findIndex(r => r.id === cur.id) - dir]
    if (!neighbor || (dir === 1 && !canManage(myPos, neighbor.position))) return
    if (neighbor.position === cur.position) {
      const np = Math.min(myPos - 1, Math.max(0, cur.position + dir))
      const { error } = await supabase.from('roles').update({ position: np }).eq('id', cur.id)
      if (error) setErr(error.message)
      return
    }
    const r1 = await supabase.from('roles').update({ position: neighbor.position }).eq('id', cur.id)
    const r2 = await supabase.from('roles').update({ position: cur.position }).eq('id', neighbor.id)
    const e = r1.error ?? r2.error
    if (e) setErr(e.message)
  }
  const toggle = (k: string) => patch({ perms: cur!.perms.includes(k) ? cur!.perms.filter(x => x !== k) : [...cur!.perms, k] })

  return (
    <Modal title="Cargos do servidor" onClose={onClose} wide>
      <div className="flex gap-5">
        <div className="w-52 shrink-0 space-y-1">
          {sorted.map(r => (
            <button key={r.id} onClick={() => { setSelId(r.id); setDraft(null) }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left ${r.id === selId ? 'bg-holz-200' : 'hover:bg-holz-200/60'}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
              <span className="flex-1 truncate">{r.name}</span>
              {!canManage(myPos, r.position) && <span title="Acima ou igual ao seu cargo" className="text-holz-mute"><Icon name="lock" size={14} /></span>}
            </button>
          ))}
          {myPerms.includes('manage_roles') && myPos > 0 && (
            <button onClick={create} className="btn mt-2 w-full justify-center border border-holz-live text-holz-live"><Icon name="plus" size={16} />Novo cargo</button>
          )}
        </div>
        {cur ? (
          <div className="flex-1 space-y-3">
            <div className="flex gap-2">
              <input disabled={!editable} value={cur.name} maxLength={32} onChange={e => patch({ name: e.target.value })} className={`${field} flex-1`} placeholder="Nome do cargo" />
              <input disabled={!editable} type="color" value={cur.color} onChange={e => patch({ color: e.target.value })} className="h-10 w-12 cursor-pointer rounded-lg border border-holz-line bg-holz-200 p-1" />
            </div>
            <p className="text-xs font-semibold text-holz-mute">permissões</p>
            {PERMS.map(p => {
              const allowed = myPerms.includes(p.key)
              return (
                <label key={p.key} className={`flex items-start gap-3 rounded-lg border border-holz-line p-2.5 ${editable && allowed ? 'cursor-pointer' : 'opacity-50'}`}>
                  <input type="checkbox" disabled={!editable || !allowed} checked={cur.perms.includes(p.key)} onChange={() => toggle(p.key)} className="mt-1 accent-holz-500" />
                  <span><b>{p.label}</b><br /><span className="text-xs text-holz-mute">{allowed ? p.hint : 'Você não tem esta permissão para conceder'}</span></span>
                </label>
              )
            })}
            {err && <p className="text-sm text-holz-coral">{err}</p>}
            {editable && (
              <div className="flex items-center gap-2 pt-1">
                <button title="Subir na hierarquia" onClick={() => move(1)} className="btn border border-holz-line px-3">↑</button>
                <button title="Descer na hierarquia" onClick={() => move(-1)} className="btn border border-holz-line px-3">↓</button>
                <span className="flex-1" />
                <button onClick={remove} className="px-3 text-holz-coral">Apagar</button>
                <button onClick={save} className="btn bg-holz-500 text-holz-onaccent">Salvar</button>
              </div>
            )}
            {!editable && <p className="text-sm text-holz-mute">Você só pode editar cargos abaixo do seu na hierarquia.</p>}
          </div>
        ) : <p className="text-holz-mute">Nenhum cargo.</p>}
      </div>
    </Modal>
  )
}
