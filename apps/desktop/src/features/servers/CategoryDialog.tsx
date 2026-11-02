import { useState } from 'react'
import { supabase, type Category } from '../../lib/supabase'
import Modal from '../../components/Modal'

export default function CategoryDialog({ serverId, category, onClose }: { serverId: string; category?: Category; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? ''); const [err, setErr] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return
    const { error } = category
      ? await supabase.from('categories').update({ name: name.trim() }).eq('id', category.id)
      : await supabase.from('categories').insert({ server_id: serverId, name: name.trim() })
    if (error) setErr(error.message); else onClose()
  }
  async function remove() {
    if (!category || !confirm(`Apagar a categoria "${category.name}"? Os canais dela ficam sem categoria.`)) return
    const { error } = await supabase.from('categories').delete().eq('id', category.id)
    if (error) setErr(error.message); else onClose()
  }
  return (
    <Modal title={category ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <input autoFocus value={name} maxLength={50} onChange={e => setName(e.target.value)} placeholder="Nome da categoria"
          className="w-full rounded-leafsm border border-holz-line bg-holz-200 p-2.5 outline-none focus:border-holz-500" />
        {err && <p className="text-sm text-holz-coral">{err}</p>}
        <div className="flex items-center gap-2">
          {category && <button type="button" onClick={remove} className="px-3 text-holz-coral">Apagar</button>}<span className="flex-1" />
          <button type="button" onClick={onClose} className="px-3 text-holz-mute">Cancelar</button>
          <button disabled={!name.trim()} className="btn bg-holz-500 text-holz-onaccent disabled:opacity-50">Salvar</button>
        </div>
      </form>
    </Modal>
  )
}
